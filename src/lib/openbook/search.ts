/**
 * Hybrid search: FTS + vector similarity + RRF ranking
 * SQLite-first implementation with JS-side cosine similarity
 */

import { prisma } from '@/lib/db'
import { generateEmbedding, cosineSimilarity } from './embeddings'

export interface SearchResult {
  chunkId: string
  sourceId: string
  sourceTitle: string
  content: string
  score: number
  chunkIndex: number
}

const RRF_K = 60

/**
 * Full-text keyword search using SQLite LIKE (FTS5 can be added later)
 */
async function keywordSearch(
  notebookId: string,
  query: string,
  limit: number,
): Promise<Array<{ chunkId: string; rank: number }>> {
  // Split query into keywords and search each
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2)
  if (keywords.length === 0) return []

  const chunks = await prisma.sourceChunk.findMany({
    where: {
      source: {
        notebookId,
        status: 'ready',
        pinned: false, // only search unpinned sources via RAG
      },
    },
    select: { id: true, content: true },
  })

  // Score chunks by keyword match frequency
  const scored = chunks.map(chunk => {
    const lower = chunk.content.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      const matches = lower.split(kw).length - 1
      score += matches
    }
    return { chunkId: chunk.id, score }
  }).filter(c => c.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((c, i) => ({ chunkId: c.chunkId, rank: i + 1 }))
}

/**
 * Vector similarity search using stored embeddings
 */
async function vectorSearch(
  notebookId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<Array<{ chunkId: string; rank: number }>> {
  const chunks = await prisma.sourceChunk.findMany({
    where: {
      source: {
        notebookId,
        status: 'ready',
        pinned: false,
      },
      embedding: { not: null },
    },
    select: { id: true, embedding: true },
  })

  const scored = chunks.map(chunk => {
    const emb = JSON.parse(chunk.embedding!) as number[]
    return { chunkId: chunk.id, score: cosineSimilarity(queryEmbedding, emb) }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((c, i) => ({ chunkId: c.chunkId, rank: i + 1 }))
}

/**
 * Reciprocal Rank Fusion: combine keyword + vector rankings
 */
function rrfFusion(
  keywordResults: Array<{ chunkId: string; rank: number }>,
  vectorResults: Array<{ chunkId: string; rank: number }>,
): Array<{ chunkId: string; score: number }> {
  const scores = new Map<string, number>()

  for (const r of keywordResults) {
    scores.set(r.chunkId, (scores.get(r.chunkId) || 0) + 1 / (RRF_K + r.rank))
  }
  for (const r of vectorResults) {
    scores.set(r.chunkId, (scores.get(r.chunkId) || 0) + 1 / (RRF_K + r.rank))
  }

  return Array.from(scores.entries())
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Hybrid search: combines keyword + vector search with RRF
 */
export async function hybridSearch(
  query: string,
  notebookId: string,
  apiKey: string,
  options: { limit?: number } = {},
): Promise<SearchResult[]> {
  const limit = options.limit || 10
  const candidateLimit = 20

  // Run keyword and vector search in parallel
  const queryEmb = await generateEmbedding(query, apiKey)

  const [kwResults, vecResults] = await Promise.all([
    keywordSearch(notebookId, query, candidateLimit),
    vectorSearch(notebookId, queryEmb.embedding, candidateLimit),
  ])

  // Fuse rankings
  const fused = rrfFusion(kwResults, vecResults).slice(0, limit)
  if (fused.length === 0) return []

  // Fetch full chunk data
  const chunkIds = fused.map(f => f.chunkId)
  const chunks = await prisma.sourceChunk.findMany({
    where: { id: { in: chunkIds } },
    include: { source: { select: { id: true, title: true } } },
  })

  const chunkMap = new Map(chunks.map(c => [c.id, c]))

  return fused.map(f => {
    const chunk = chunkMap.get(f.chunkId)!
    return {
      chunkId: f.chunkId,
      sourceId: chunk.source.id,
      sourceTitle: chunk.source.title,
      content: chunk.content,
      score: f.score,
      chunkIndex: chunk.chunkIndex,
    }
  }).filter(r => r.content)
}
