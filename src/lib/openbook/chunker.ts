/**
 * Text chunking with overlap for embedding and retrieval
 */

export interface Chunk {
  content: string
  index: number
  tokenCount: number
}

const CHUNK_SIZE = 500 // words
const CHUNK_OVERLAP = 50 // words overlap between chunks

/** Rough token estimate: ~1.3 tokens per word for English */
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3)
}

/**
 * Split text into overlapping chunks of ~500 words each.
 * Tries to split at paragraph/sentence boundaries.
 */
export function chunkText(text: string): Chunk[] {
  const words = text.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return []

  // Small content: single chunk
  if (words.length <= CHUNK_SIZE) {
    return [{
      content: words.join(' '),
      index: 0,
      tokenCount: estimateTokens(words.join(' ')),
    }]
  }

  const chunks: Chunk[] = []
  let start = 0

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length)
    const chunkWords = words.slice(start, end)
    const content = chunkWords.join(' ')

    chunks.push({
      content,
      index: chunks.length,
      tokenCount: estimateTokens(content),
    })

    if (end >= words.length) break
    start = end - CHUNK_OVERLAP
  }

  return chunks
}
