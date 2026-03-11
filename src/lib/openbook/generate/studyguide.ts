/**
 * Study guide generation — structured learning document synthesized from sources
 */

import { prisma } from '@/lib/db'
import { callLLM } from '../ai'
import { calculateCredits } from '@/lib/credits'

export async function generateStudyGuide(
  notebookId: string,
  model: string,
  apiKey: string,
  onProgress: (p: { stage: string; message: string; progress: number }) => Promise<void>,
): Promise<{ content: string; metadata?: string; credits: number }> {
  await onProgress({ stage: 'generating', message: 'Gathering source material...', progress: 10 })

  const sources = await prisma.notebookSource.findMany({
    where: { notebookId, status: 'ready' },
    select: { title: true, summary: true, rawContent: true },
    orderBy: { createdAt: 'asc' },
  })

  if (sources.length === 0) throw new Error('No ready sources')

  const sourceBlock = sources
    .map((s, i) => {
      const content = s.summary
        ? `Summary: ${s.summary}\n\nKey Content: ${s.rawContent.slice(0, 5000)}`
        : s.rawContent.slice(0, 6000)
      return `### Source ${i + 1}: ${s.title}\n${content}`
    })
    .join('\n\n---\n\n')

  await onProgress({ stage: 'generating', message: 'Synthesizing study guide...', progress: 30 })

  const result = await callLLM(
    model,
    [
      {
        role: 'system',
        content: `You are an expert educator and curriculum designer. Create a comprehensive study guide from the provided sources.

Output JSON:
{
  "title": "Study guide title",
  "sections": [
    {
      "heading": "1. Section Title",
      "content": "Detailed markdown content explaining the topic...",
      "keyTerms": ["term1", "term2"],
      "reviewQuestions": [
        "Question 1?",
        "Question 2?"
      ]
    }
  ],
  "glossary": [
    {"term": "Term", "definition": "Clear definition"}
  ],
  "furtherReading": ["Source 1: relevant sections", "Source 2: key chapters"]
}

Guidelines:
- Organize logically: introduction -> core concepts -> advanced topics -> review
- Each section should have 2-4 review questions
- Include all technical terms in the glossary
- Cross-reference between sections where relevant
- Keep content educational and well-structured`,
      },
      {
        role: 'user',
        content: `Create a study guide from these ${sources.length} sources:\n\n${sourceBlock}`,
      },
    ],
    apiKey,
    { temperature: 0.3, maxTokens: 8192 },
  )

  const credits = calculateCredits(model, result.inputTokens, result.outputTokens)

  await onProgress({ stage: 'ready', message: 'Study guide complete', progress: 100 })

  return {
    content: result.text,
    metadata: JSON.stringify({ sourceCount: sources.length }),
    credits,
  }
}
