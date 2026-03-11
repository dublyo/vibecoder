/**
 * Flashcard generation from notebook sources
 */

import { prisma } from '@/lib/db'
import { callLLM } from '../ai'
import { calculateCredits } from '@/lib/credits'

export async function generateFlashcards(
  notebookId: string,
  model: string,
  apiKey: string,
  options: Record<string, unknown> | undefined,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ content: string; metadata?: string; credits: number }> {
  const cardCount = (options?.cardCount as number) || 20

  await onProgress({ stage: 'generating', message: 'Analyzing sources for flashcards...', progress: 15 })

  const sources = await prisma.notebookSource.findMany({
    where: { notebookId, status: 'ready' },
    select: { id: true, title: true, summary: true, rawContent: true },
    orderBy: { createdAt: 'asc' },
  })

  if (sources.length === 0) throw new Error('No ready sources')

  // Use summaries + first portion of content
  const sourceBlock = sources
    .map((s, i) => {
      const content = s.summary || s.rawContent.slice(0, 4000)
      return `### Source ${i + 1} (id: ${s.id}): ${s.title}\n${content}`
    })
    .join('\n\n---\n\n')

  await onProgress({ stage: 'generating', message: `Generating ${cardCount} flashcards...`, progress: 40 })

  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are an expert educator. Generate exactly ${cardCount} flashcards from the provided source material.

Output JSON:
{
  "cards": [
    {
      "id": "card-1",
      "front": "Question or prompt",
      "back": "Detailed answer",
      "sourceId": "source ID this came from",
      "difficulty": "easy|medium|hard",
      "tags": ["tag1", "tag2"]
    }
  ],
  "totalCards": ${cardCount},
  "topicBreakdown": {"topic1": 5, "topic2": 8}
}

Guidelines:
- Mix difficulty levels: ~30% easy, ~50% medium, ~20% hard
- Cover all sources proportionally
- Questions should test understanding, not just recall
- Include factual, conceptual, and application questions
- Tags should be 1-2 word topic labels`,
      },
      {
        role: 'user',
        content: `Generate flashcards from these sources:\n\n${sourceBlock}`,
      },
    ],
    apiKey,
    { temperature: 0.4, maxTokens: 8192 },
  )

  const credits = calculateCredits(model, result.inputTokens, result.outputTokens)

  await onProgress({ stage: 'ready', message: 'Flashcards generated', progress: 100 })

  return {
    content: result.text,
    metadata: JSON.stringify({ cardCount, sourceCount: sources.length }),
    credits,
  }
}
