/**
 * Notebook-level summary generation across all sources
 */

import { prisma } from '@/lib/db'
import { callLLM } from '../ai'
import { calculateCredits } from '@/lib/credits'

export async function generateNotebookSummary(
  notebookId: string,
  model: string,
  apiKey: string,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ content: string; metadata?: string; credits: number }> {
  await onProgress({ stage: 'generating', message: 'Gathering source summaries...', progress: 20 })

  const sources = await prisma.notebookSource.findMany({
    where: { notebookId, status: 'ready' },
    select: { title: true, summary: true, rawContent: true, wordCount: true },
    orderBy: { createdAt: 'asc' },
  })

  if (sources.length === 0) throw new Error('No ready sources to summarize')

  const sourceBlock = sources
    .map((s, i) => {
      const content = s.summary || s.rawContent.slice(0, 3000)
      return `### Source ${i + 1}: ${s.title}\n${content}`
    })
    .join('\n\n---\n\n')

  await onProgress({ stage: 'generating', message: `Synthesizing ${sources.length} sources...`, progress: 50 })

  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are a research synthesizer. Create a comprehensive summary of all provided sources.

Output JSON:
{
  "overview": "2-3 paragraph executive summary",
  "keyThemes": ["theme1", "theme2", ...],
  "perSource": [
    {"title": "source title", "keyPoints": ["point1", "point2"]}
  ],
  "connections": "Brief description of how sources relate to each other"
}`,
      },
      {
        role: 'user',
        content: `Summarize these ${sources.length} sources:\n\n${sourceBlock}`,
      },
    ],
    apiKey,
    { temperature: 0.2, maxTokens: 4096 },
  )

  const credits = calculateCredits(model, result.inputTokens, result.outputTokens)

  await onProgress({ stage: 'ready', message: 'Summary complete', progress: 100 })

  return {
    content: result.text,
    metadata: JSON.stringify({ sourceCount: sources.length }),
    credits,
  }
}
