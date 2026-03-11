/**
 * Source ingestion pipeline: extract -> chunk -> embed -> summarize
 */

import { prisma } from '@/lib/db'
import { chunkText } from './chunker'
import { generateEmbedding } from './embeddings'
import { callLLM } from './ai'
import { calculateCredits } from '@/lib/credits'
import { crawlPage } from '@/lib/research/crawl'

export interface IngestionProgress {
  stage: string
  message: string
  progress: number
}

export interface IngestionResult {
  chunkCount: number
  wordCount: number
  tokenCount: number
  totalCredits: number
}

/**
 * Extract text content from a source based on its type
 */
async function extractContent(
  source: { type: string; rawContent: string; url?: string | null; fileName?: string | null },
): Promise<{ content: string; title?: string }> {
  if (source.type === 'url' && source.url) {
    const crawled = await crawlPage(source.url)
    if (!crawled.success) {
      throw new Error(`Failed to crawl URL: ${crawled.error}`)
    }
    return { content: crawled.content, title: crawled.title }
  }

  // For file and text types, rawContent is already set by the upload handler
  return { content: source.rawContent }
}

/**
 * Generate a summary for a source using a cheap model
 */
async function summarizeSource(
  content: string,
  title: string,
  model: string,
  apiKey: string,
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: 'You are a research assistant. Write a concise 3-5 sentence summary of the following document. Focus on the main topics, key findings, and important details.',
      },
      {
        role: 'user',
        content: `Document: "${title}"\n\n${content.slice(0, 10000)}`,
      },
    ],
    apiKey,
    { temperature: 0.2, maxTokens: 512 },
  )

  return { summary: result.text, inputTokens: result.inputTokens, outputTokens: result.outputTokens }
}

/**
 * Process a source: extract -> chunk -> embed -> summarize
 */
export async function processSource(
  sourceId: string,
  cheapModel: string,
  apiKey: string,
  onProgress: (p: IngestionProgress) => Promise<void>,
): Promise<IngestionResult> {
  let totalCredits = 0

  // Get source
  const source = await prisma.notebookSource.findUniqueOrThrow({
    where: { id: sourceId },
  })

  // Stage 1: Extract content
  await onProgress({ stage: 'extracting', message: 'Extracting text...', progress: 10 })

  let content = source.rawContent
  let extractedTitle: string | undefined

  if (source.type === 'url' && source.url && !content) {
    const extracted = await extractContent(source)
    content = extracted.content
    extractedTitle = extracted.title
  }

  if (!content || content.trim().length < 10) {
    throw new Error('No content to process')
  }

  const wordCount = content.split(/\s+/).length
  const tokenCount = Math.ceil(wordCount * 1.3)

  await prisma.notebookSource.update({
    where: { id: sourceId },
    data: {
      rawContent: content,
      title: extractedTitle || source.title,
      wordCount,
      tokenCount,
      status: 'processing',
    },
  })

  // Stage 2: Chunk
  await onProgress({ stage: 'chunking', message: `Splitting into chunks (${wordCount} words)...`, progress: 25 })
  const chunks = chunkText(content)

  // Stage 3: Embed
  await onProgress({ stage: 'embedding', message: `Generating embeddings for ${chunks.length} chunks...`, progress: 40 })

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    let embeddingJson: string | null = null

    try {
      const embResult = await generateEmbedding(chunk.content, apiKey)
      embeddingJson = JSON.stringify(embResult.embedding)
      // Embedding costs are negligible (~$0.02/1M tokens) so we track but don't charge much
      totalCredits += 0.01
    } catch (err) {
      console.error(`[openbook] Embedding failed for chunk ${i}:`, (err as Error).message)
    }

    await prisma.sourceChunk.create({
      data: {
        sourceId,
        content: chunk.content,
        chunkIndex: chunk.index,
        embedding: embeddingJson,
        tokenCount: chunk.tokenCount,
      },
    })

    if (i % 5 === 0 || i === chunks.length - 1) {
      const pct = 40 + Math.round(((i + 1) / chunks.length) * 30)
      await onProgress({ stage: 'embedding', message: `Embedded ${i + 1}/${chunks.length} chunks`, progress: pct })
    }
  }

  // Stage 4: Summarize
  await onProgress({ stage: 'summarizing', message: 'Generating summary...', progress: 75 })

  try {
    const summary = await summarizeSource(content, source.title, cheapModel, apiKey)
    totalCredits += calculateCredits(cheapModel, summary.inputTokens, summary.outputTokens)

    await prisma.notebookSource.update({
      where: { id: sourceId },
      data: { summary: summary.summary },
    })
  } catch (err) {
    console.error(`[openbook] Summary failed:`, (err as Error).message)
  }

  // Mark ready
  await prisma.notebookSource.update({
    where: { id: sourceId },
    data: { status: 'ready' },
  })

  await onProgress({ stage: 'ready', message: 'Source processed successfully', progress: 100 })

  return { chunkCount: chunks.length, wordCount, tokenCount, totalCredits }
}
