/**
 * Embedding generation via OpenRouter + cosine similarity for SQLite
 */

import { prisma } from '@/lib/db'

const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/** Available embedding models on OpenRouter */
export const EMBEDDING_MODELS = [
  { id: 'openai/text-embedding-3-small', label: 'OpenAI Text Embedding 3 Small', dims: 1536, price: '$0.02/1M tokens' },
  { id: 'openai/text-embedding-3-large', label: 'OpenAI Text Embedding 3 Large', dims: 3072, price: '$0.13/1M tokens' },
  { id: 'openai/text-embedding-ada-002', label: 'OpenAI Ada 002', dims: 1536, price: '$0.10/1M tokens' },
  { id: 'google/gemini-embedding-exp', label: 'Google Gemini Embedding', dims: 768, price: 'Free' },
  { id: 'cohere/embed-english-v3.0', label: 'Cohere Embed English v3', dims: 1024, price: '$0.10/1M tokens' },
  { id: 'cohere/embed-multilingual-v3.0', label: 'Cohere Embed Multilingual v3', dims: 1024, price: '$0.10/1M tokens' },
]

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
}

/** Get the configured embedding model from settings */
async function getEmbeddingModel(): Promise<string> {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'openbook_embedding_model' },
    })
    return setting?.value || DEFAULT_EMBEDDING_MODEL
  } catch {
    return DEFAULT_EMBEDDING_MODEL
  }
}

/**
 * Generate embedding for a single text via OpenRouter embeddings API
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<EmbeddingResult> {
  const model = await getEmbeddingModel()

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vibecode.new',
      'X-Title': 'VibeCoder OpenBook',
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 8000),
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding error (${res.status}): ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const embeddingData = data.data?.[0]
  const usage = data.usage || {}

  return {
    embedding: embeddingData?.embedding || [],
    tokenCount: usage.total_tokens || 0,
  }
}

/**
 * Batch generate embeddings for multiple texts
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = []
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10)
    const batchResults = await Promise.all(
      batch.map(t => generateEmbedding(t, apiKey))
    )
    results.push(...batchResults)
  }
  return results
}

/**
 * Cosine similarity between two vectors (for SQLite — computed in JS)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
