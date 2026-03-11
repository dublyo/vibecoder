/**
 * BullMQ queue and worker for background research jobs
 */
import { Queue, Worker } from 'bullmq'
import { publishProgress } from './redis'
import { planResearch, executeResearch, type ResearchProgress } from './pipeline'
import { prisma } from '@/lib/db'
import { deductCredits } from '@/lib/credits'

export interface ResearchJobData {
  jobId: string // ResearchJob.id
  conversationId: string
  userId: string
  query: string
  depth: 'standard' | 'extensive'
  cheapModel: string
  maestroModel: string
  serperApiKey: string
  openRouterApiKey: string
  // Phase 2 fields (set when resuming after approval)
  phase?: 'plan' | 'execute'
  keywords?: string[]
  maxCrawlUrls?: number
  priorCredits?: number
}

let researchQueue: Queue<ResearchJobData> | null = null

const REDIS_OPTS = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null as null,
}

export function getResearchQueue(): Queue<ResearchJobData> {
  if (!researchQueue) {
    researchQueue = new Queue<ResearchJobData>('research', {
      connection: REDIS_OPTS,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        attempts: 1,
      },
    })
  }
  return researchQueue
}

let worker: Worker<ResearchJobData> | null = null

export function startResearchWorker() {
  if (worker) return worker

  worker = new Worker<ResearchJobData>(
    'research',
    async (job) => {
      const data = job.data
      const phase = data.phase || 'plan'

      console.log(`[research-worker] Starting job ${data.jobId} phase=${phase} for query: "${data.query}"`)

      const onProgress = async (p: ResearchProgress) => {
        await prisma.researchJob.update({
          where: { id: data.jobId },
          data: {
            status: p.stage,
            progress: p.progress,
            progressMessage: p.message,
          },
        }).catch(() => {})

        await publishProgress(data.jobId, {
          stage: p.stage,
          message: p.message,
          progress: p.progress,
          detail: p.detail,
        })
      }

      try {
        if (phase === 'plan') {
          // ═══════════════════════════════════════
          // PHASE 1: Extract keywords, then pause for approval
          // ═══════════════════════════════════════
          await prisma.researchJob.update({
            where: { id: data.jobId },
            data: { status: 'extracting_keywords', startedAt: new Date(), progress: 5 },
          })

          const plan = await planResearch({
            query: data.query,
            depth: data.depth,
            cheapModel: data.cheapModel,
            maestroModel: data.maestroModel,
            serperApiKey: data.serperApiKey,
            openRouterApiKey: data.openRouterApiKey,
            onProgress,
          })

          // Build the plan message
          const planMessage = buildPlanMessage(data, plan.keywords)

          // Save plan to DB and set status to awaiting_approval
          await prisma.researchJob.update({
            where: { id: data.jobId },
            data: {
              status: 'awaiting_approval',
              progress: 12,
              progressMessage: 'Waiting for your approval to proceed...',
              keywords: JSON.stringify(plan.keywords),
              totalCredits: plan.planCredits,
              planMessage,
            },
          })

          // Save the plan as an assistant message
          await prisma.message.create({
            data: {
              conversationId: data.conversationId,
              userId: data.userId,
              role: 'assistant',
              content: planMessage,
              modelUsed: data.cheapModel,
              routingMode: 'research',
              routingTier: 'research-plan',
              creditsCost: plan.planCredits,
            },
          })

          // Publish plan event so the UI can show approve button
          await publishProgress(data.jobId, {
            stage: 'awaiting_approval',
            message: 'Waiting for your approval to proceed...',
            progress: 12,
            keywords: plan.keywords,
            planMessage,
          })

          // Deduct planning credits
          await deductCredits(data.userId, plan.planCredits, `Research plan: ${data.cheapModel}`)

          console.log(`[research-worker] Job ${data.jobId} plan complete. ${plan.keywords.length} keywords. Waiting for approval.`)
        } else {
          // ═══════════════════════════════════════
          // PHASE 2: Execute full research (after approval)
          // ═══════════════════════════════════════
          const keywords = data.keywords || []
          const maxCrawlUrls = data.maxCrawlUrls || (data.depth === 'extensive' ? 20 : 12)
          const priorCredits = data.priorCredits || 0

          const result = await executeResearch({
            query: data.query,
            depth: data.depth,
            cheapModel: data.cheapModel,
            maestroModel: data.maestroModel,
            serperApiKey: data.serperApiKey,
            openRouterApiKey: data.openRouterApiKey,
            onProgress,
            keywords,
            maxCrawlUrls,
            priorCredits,
          })

          // Save results to DB
          await prisma.researchJob.update({
            where: { id: data.jobId },
            data: {
              status: 'completed',
              progress: 100,
              progressMessage: 'Research complete!',
              searchResults: JSON.stringify(Object.fromEntries(
                Object.entries(result.searchResults).map(([k, v]) => [k, v.slice(0, 5)])
              )),
              crawledPages: JSON.stringify(result.crawledPages.map(p => ({
                url: p.url, title: p.title, wordCount: p.wordCount, success: p.success,
              }))),
              summaries: JSON.stringify(result.summaries),
              finalReport: result.report,
              sources: JSON.stringify(result.sources),
              totalCredits: result.totalCredits,
              serperCredits: result.serperCreditsUsed,
              completedAt: new Date(),
            },
          })

          // Save the report as an assistant message
          await prisma.message.create({
            data: {
              conversationId: data.conversationId,
              userId: data.userId,
              role: 'assistant',
              content: result.report,
              modelUsed: data.maestroModel,
              routingMode: 'research',
              routingTier: 'research',
              creditsCost: result.totalCredits,
              pipelineLog: JSON.stringify({
                type: 'research',
                keywords: result.keywords,
                sourcesCount: result.sources.length,
                crawledCount: result.crawledPages.filter(p => p.success).length,
                serperCredits: result.serperCreditsUsed,
                cheapModel: data.cheapModel,
                maestroModel: data.maestroModel,
              }),
            },
          })

          // Deduct execution credits (minus already-deducted plan credits)
          const executionCredits = result.totalCredits - priorCredits
          if (executionCredits > 0) {
            await deductCredits(data.userId, executionCredits, `Research: ${data.maestroModel}`)
          }

          // Update conversation
          await prisma.conversation.update({
            where: { id: data.conversationId },
            data: {
              totalCreditsUsed: { increment: result.totalCredits },
              messageCount: { increment: 2 }, // plan message + report message
              updatedAt: new Date(),
            },
          })

          // Publish final completion event
          await publishProgress(data.jobId, {
            stage: 'completed',
            message: 'Research complete!',
            progress: 100,
            report: result.report,
            sources: result.sources,
            totalCredits: result.totalCredits,
          })

          console.log(`[research-worker] Job ${data.jobId} completed. ${result.sources.length} sources, ${result.totalCredits.toFixed(1)} credits.`)
        }
      } catch (err) {
        const errorMsg = (err as Error).message || 'Unknown error'
        console.error(`[research-worker] Job ${data.jobId} failed:`, errorMsg)

        await prisma.researchJob.update({
          where: { id: data.jobId },
          data: {
            status: 'failed',
            errorMessage: errorMsg.slice(0, 500),
            completedAt: new Date(),
          },
        }).catch(() => {})

        await publishProgress(data.jobId, {
          stage: 'failed',
          message: `Research failed: ${errorMsg.slice(0, 200)}`,
          progress: 0,
        })

        throw err
      }
    },
    {
      connection: REDIS_OPTS,
      concurrency: 2,
    },
  )

  worker.on('error', (err) => {
    console.error('[research-worker] Worker error:', err.message)
  })

  console.log('[research-worker] Worker started, listening for jobs...')
  return worker
}

function buildPlanMessage(data: ResearchJobData, keywords: string[]): string {
  const depthLabel = data.depth === 'extensive' ? 'Extensive' : 'Standard'
  const cheapName = data.cheapModel.split('/').pop()
  const maestroName = data.maestroModel.split('/').pop()
  const maxUrls = data.depth === 'extensive' ? 20 : 12

  return `## Research Plan

I've analyzed your query and here's what I'll do:

**Query:** ${data.query}

### Search Keywords
${keywords.map((k, i) => `${i + 1}. "${k}"`).join('\n')}

### Pipeline Steps
1. **Search** — Run ${keywords.length} web searches using the keywords above
2. **Crawl** — Fetch up to ${maxUrls} top-ranked pages
3. **Summarize** — Extract key findings from each page using \`${cheapName}\`
4. **Synthesize** — Write a comprehensive report with citations using \`${maestroName}\`

**Depth:** ${depthLabel} | **Cheap model:** ${cheapName} | **Maestro model:** ${maestroName}

*Click **Approve** below to start the research, or send a new message to try different keywords.*`
}
