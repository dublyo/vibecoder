/**
 * Context assembly: pinned sources (full) + RAG chunks (query-relevant)
 */

import { prisma } from '@/lib/db'
import { hybridSearch, type SearchResult } from './search'

export interface AssembledContext {
  pinnedContent: string
  ragChunks: SearchResult[]
  ragContent: string
  fullContext: string
  pinnedSourceCount: number
  ragChunkCount: number
}

/**
 * Assemble context for a chat query:
 * - Pinned sources: full rawContent included
 * - Unpinned sources: top RAG chunks from hybrid search
 */
export async function assembleContext(
  query: string,
  notebookId: string,
  apiKey: string,
  options: { ragLimit?: number; maxPinnedChars?: number } = {},
): Promise<AssembledContext> {
  const ragLimit = options.ragLimit || 10
  const maxPinnedChars = options.maxPinnedChars || 100000 // ~25K words

  // Get pinned sources
  const pinnedSources = await prisma.notebookSource.findMany({
    where: {
      notebookId,
      pinned: true,
      status: 'ready',
    },
    select: { title: true, rawContent: true },
    orderBy: { createdAt: 'asc' },
  })

  let pinnedContent = ''
  let charCount = 0
  for (const src of pinnedSources) {
    const block = `## ${src.title}\n${src.rawContent}\n\n`
    if (charCount + block.length > maxPinnedChars) break
    pinnedContent += block
    charCount += block.length
  }

  // Hybrid search for unpinned sources
  const ragChunks = await hybridSearch(query, notebookId, apiKey, { limit: ragLimit })

  const ragContent = ragChunks
    .map((c, i) => `[Source ${i + 1}: ${c.sourceTitle}]\n${c.content}`)
    .join('\n\n')

  const sections = []
  if (pinnedContent) sections.push(pinnedContent)
  if (ragContent) sections.push(`---\nRelevant excerpts:\n${ragContent}`)

  return {
    pinnedContent,
    ragChunks,
    ragContent,
    fullContext: sections.join('\n\n'),
    pinnedSourceCount: pinnedSources.length,
    ragChunkCount: ragChunks.length,
  }
}
