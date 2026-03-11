import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { prisma } from '@/lib/db'

// Memory Manager: Compresses conversation context to reduce token costs
// - Rolling summary after every N messages
// - Hot/Warm/Cold memory tiers
// - Selective context for specialized models

const SUMMARY_MODEL = 'liquid/lfm-2-24b-a2b' // ultra-cheap for compression
const SUMMARY_THRESHOLD = 10 // compress after this many messages

const SUMMARY_PROMPT = `Summarize this conversation concisely. Include:
- Key facts mentioned (names, numbers, preferences)
- Decisions made or conclusions reached
- Current topic/context

Keep it under 200 words. Only output the summary, nothing else.`

export async function shouldCompress(conversationId: string): Promise<boolean> {
  const count = await prisma.message.count({ where: { conversationId } })
  return count >= SUMMARY_THRESHOLD && count % SUMMARY_THRESHOLD === 0
}

export async function compressContext(
  conversationId: string,
  apiKey: string,
): Promise<string | null> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  })

  if (messages.length < SUMMARY_THRESHOLD) return null

  // Summarize all but the last 5 messages (keep those as hot context)
  const toSummarize = messages.slice(0, -5)
  const transcript = toSummarize
    .map(m => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  try {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://vibecode.new',
        'X-Title': 'VibeCoder',
      },
    })

    const { text } = await generateText({
      model: openrouter.chat(SUMMARY_MODEL),
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: transcript }],
      maxOutputTokens: 300,
    })

    // Store the summary in the conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { contextSummary: text },
    })

    return text
  } catch {
    return null
  }
}

// Build optimized context with memory tiers
export function buildOptimizedContext(
  messages: { role: string; content: string }[],
  contextSummary: string | null,
  taskType?: string,
): { role: string; content: string }[] {
  const context: { role: string; content: string }[] = []

  // Warm tier: compressed summary of older messages
  if (contextSummary) {
    context.push({
      role: 'system',
      content: `Previous conversation summary: ${contextSummary}`,
    })
  }

  // Hot tier: last 5 messages (full text)
  const hotMessages = messages.slice(-5)

  // Selective context: for coding tasks, strip non-code content from older messages
  if (taskType === 'coding' && messages.length > 5) {
    const warmMessages = messages.slice(-10, -5)
    for (const m of warmMessages) {
      // Keep only code blocks and short text from warm messages
      const codeBlocks = m.content.match(/```[\s\S]*?```/g)
      if (codeBlocks) {
        context.push({ role: m.role, content: codeBlocks.join('\n\n') })
      }
    }
  }

  context.push(...hotMessages)
  return context
}
