/**
 * BullMQ queue and worker for OpenBook background jobs:
 * - Source ingestion (extract -> chunk -> embed -> summarize)
 * - Artifact generation (flashcards, study guide, podcast, mind map)
 */

import { Queue, Worker } from 'bullmq'
import { prisma } from '@/lib/db'
import { deductCredits } from '@/lib/credits'
import { processSource, type IngestionProgress } from './ingestion'
import { publishOpenBookProgress } from './redis'

export type OpenBookJobType = 'ingest' | 'generate' | 'generate-audio'

export interface OpenBookJobData {
  type: OpenBookJobType
  // Ingest fields
  sourceId?: string
  // Generate fields
  notebookId?: string
  artifactId?: string
  artifactType?: string // summary, flashcards, studyguide, podcast, mindmap
  // Common
  userId: string
  cheapModel: string
  maestroModel: string
  openRouterApiKey: string
  options?: Record<string, unknown> // e.g. {audienceLevel: 'undergraduate'}
  // Generate-audio fields
  script?: string // JSON stringified PodcastScript
  language?: string
}

let openbookQueue: Queue<OpenBookJobData> | null = null

const REDIS_OPTS = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null as null,
}

export function getOpenBookQueue(): Queue<OpenBookJobData> {
  if (!openbookQueue) {
    openbookQueue = new Queue<OpenBookJobData>('openbook', {
      connection: REDIS_OPTS,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        attempts: 1,
      },
    })
  }
  return openbookQueue
}

let worker: Worker<OpenBookJobData> | null = null

export function startOpenBookWorker() {
  if (worker) return worker

  worker = new Worker<OpenBookJobData>(
    'openbook',
    async (job) => {
      const data = job.data

      if (data.type === 'ingest' && data.sourceId) {
        await handleIngest(data)
      } else if (data.type === 'generate' && data.artifactId) {
        await handleGenerate(data)
      } else if (data.type === 'generate-audio' && data.artifactId) {
        await handleGenerateAudio(data)
      }
    },
    {
      connection: REDIS_OPTS,
      concurrency: 3,
    },
  )

  worker.on('error', (err) => {
    console.error('[openbook-worker] Error:', err.message)
  })

  console.log('[openbook-worker] Worker started')
  return worker
}

async function handleIngest(data: OpenBookJobData) {
  const sourceId = data.sourceId!
  const progressKey = `source:${sourceId}`

  console.log(`[openbook-worker] Ingesting source ${sourceId}`)

  try {
    const onProgress = async (p: IngestionProgress) => {
      await publishOpenBookProgress(progressKey, {
        stage: p.stage,
        message: p.message,
        progress: p.progress,
      })
    }

    const result = await processSource(
      sourceId,
      data.cheapModel,
      data.openRouterApiKey,
      onProgress,
    )

    // Deduct credits
    if (result.totalCredits > 0) {
      await deductCredits(data.userId, result.totalCredits, `OpenBook source ingestion`)
    }

    console.log(`[openbook-worker] Source ${sourceId} done: ${result.chunkCount} chunks, ${result.totalCredits.toFixed(2)} credits`)
  } catch (err) {
    const errorMsg = (err as Error).message || 'Processing failed'
    console.error(`[openbook-worker] Source ${sourceId} failed:`, errorMsg)

    await prisma.notebookSource.update({
      where: { id: sourceId },
      data: { status: 'failed', errorMessage: errorMsg.slice(0, 500) },
    }).catch(() => {})

    await publishOpenBookProgress(progressKey, {
      stage: 'failed',
      message: errorMsg.slice(0, 200),
      progress: 0,
    })
  }
}

async function handleGenerate(data: OpenBookJobData) {
  const artifactId = data.artifactId!
  const progressKey = `artifact:${artifactId}`

  console.log(`[openbook-worker] Generating artifact ${artifactId} (${data.artifactType})`)

  try {
    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { status: 'generating' },
    })

    await publishOpenBookProgress(progressKey, {
      stage: 'generating',
      message: `Generating ${data.artifactType}...`,
      progress: 10,
    })

    // Dynamic import of the generator based on type
    let result: { content: string; metadata?: string; audioUrl?: string; credits: number }

    switch (data.artifactType) {
      case 'summary': {
        const { generateNotebookSummary } = await import('./generate/summary')
        result = await generateNotebookSummary(data.notebookId!, data.cheapModel, data.openRouterApiKey, async (p) => {
          await publishOpenBookProgress(progressKey, p)
        })
        break
      }
      case 'flashcards': {
        const { generateFlashcards } = await import('./generate/flashcards')
        result = await generateFlashcards(data.notebookId!, data.cheapModel, data.openRouterApiKey, data.options, async (p) => {
          await publishOpenBookProgress(progressKey, p)
        })
        break
      }
      case 'studyguide': {
        const { generateStudyGuide } = await import('./generate/studyguide')
        result = await generateStudyGuide(data.notebookId!, data.maestroModel, data.openRouterApiKey, async (p) => {
          await publishOpenBookProgress(progressKey, p)
        })
        break
      }
      case 'podcast': {
        const { generatePodcast } = await import('./generate/podcast')
        result = await generatePodcast(data.notebookId!, data.maestroModel, data.openRouterApiKey, data.options, async (p) => {
          await publishOpenBookProgress(progressKey, p)
        })
        break
      }
      case 'mindmap': {
        const { generateMindMap } = await import('./generate/mindmap')
        result = await generateMindMap(data.notebookId!, data.cheapModel, data.openRouterApiKey, async (p) => {
          await publishOpenBookProgress(progressKey, p)
        })
        break
      }
      default:
        throw new Error(`Unknown artifact type: ${data.artifactType}`)
    }

    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: {
        content: result.content,
        metadata: result.metadata,
        audioUrl: result.audioUrl,
        status: 'ready',
        creditsUsed: result.credits,
      },
    })

    if (result.credits > 0) {
      await deductCredits(data.userId, result.credits, `OpenBook ${data.artifactType}`)
    }

    await publishOpenBookProgress(progressKey, {
      stage: 'ready',
      message: `${data.artifactType} generated successfully`,
      progress: 100,
    })

    console.log(`[openbook-worker] Artifact ${artifactId} done, ${result.credits.toFixed(2)} credits`)
  } catch (err) {
    const errorMsg = (err as Error).message || 'Generation failed'
    console.error(`[openbook-worker] Artifact ${artifactId} failed:`, errorMsg)

    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { status: 'failed', errorMessage: errorMsg.slice(0, 500) },
    }).catch(() => {})

    await publishOpenBookProgress(progressKey, {
      stage: 'failed',
      message: errorMsg.slice(0, 200),
      progress: 0,
    })
  }
}

async function handleGenerateAudio(data: OpenBookJobData) {
  const artifactId = data.artifactId!
  const progressKey = `artifact:${artifactId}`

  console.log(`[openbook-worker] Generating audio for artifact ${artifactId}`)

  try {
    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { status: 'generating' },
    })

    await publishOpenBookProgress(progressKey, {
      stage: 'generating',
      message: 'Starting audio generation...',
      progress: 5,
    })

    const script = JSON.parse(data.script!)
    const { generatePodcastAudio } = await import('./generate/podcast')

    const result = await generatePodcastAudio(
      artifactId,
      data.notebookId!,
      script,
      data.language || 'English',
      async (p) => {
        await publishOpenBookProgress(progressKey, p)
      },
    )

    const artifact = await prisma.notebookArtifact.findUnique({ where: { id: artifactId } })
    const existingMeta = artifact?.metadata ? JSON.parse(artifact.metadata) : {}
    const updatedMeta = { ...existingMeta, hasAudio: true }

    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: {
        content: data.script!,
        audioUrl: result.audioUrl,
        status: 'ready',
        metadata: JSON.stringify(updatedMeta),
        creditsUsed: (artifact?.creditsUsed || 0) + result.credits,
      },
    })

    if (result.credits > 0) {
      await deductCredits(data.userId, result.credits, 'OpenBook podcast audio')
    }

    await publishOpenBookProgress(progressKey, {
      stage: 'ready',
      message: 'Audio generated successfully',
      progress: 100,
    })

    console.log(`[openbook-worker] Audio for ${artifactId} done, ${result.credits.toFixed(2)} credits`)
  } catch (err) {
    const errorMsg = (err as Error).message || 'Audio generation failed'
    console.error(`[openbook-worker] Audio for ${artifactId} failed:`, errorMsg)

    // Keep status as ready (script still accessible) but note the error
    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { status: 'ready', errorMessage: errorMsg.slice(0, 500) },
    }).catch(() => {})

    await publishOpenBookProgress(progressKey, {
      stage: 'failed',
      message: errorMsg.slice(0, 200),
      progress: 0,
    })
  }
}
