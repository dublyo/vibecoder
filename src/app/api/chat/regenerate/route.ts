import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getOpenRouterKey } from '@/lib/openrouter'
import { calculateCredits, deductCredits, getModelContextWindow, MODEL_CREDIT_RATES } from '@/lib/credits'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

const VALID_MODELS = new Set(Object.keys(MODEL_CREDIT_RATES))

// POST /api/chat/regenerate
// Regenerates a message using a better (maestro) model
// Called when critic determines the cheap model's response was insufficient

const SYSTEM_PROMPTS = {
  mid: `You are VibeCoder, a capable AI assistant. Provide clear, well-structured answers. For coding tasks, include working examples. For analysis, cover key points thoroughly. Format code blocks with language identifiers. Use markdown.`,
  premium: `You are VibeCoder, a world-class AI assistant. You are being called because this task requires exceptional quality. Provide comprehensive, accurate, and nuanced responses. For coding: production-quality code with error handling. For analysis: thorough evaluation with multiple perspectives. For creative work: original, polished output. Format code blocks with language identifiers. Use markdown.`,
} as const

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { messageId, conversationId, model, tier } = await req.json() as {
      messageId: string
      conversationId: string
      model: string
      tier: 'mid' | 'premium'
    }

    if (!messageId || !conversationId || !model || !tier) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate model against whitelist
    if (!VALID_MODELS.has(model)) {
      return new Response(JSON.stringify({ error: 'Invalid model' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate tier
    if (tier !== 'mid' && tier !== 'premium') {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Rate limit
    const rl = checkRateLimit(`chat:${user.id}`, RATE_LIMITS.chat)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get the conversation with messages
    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(conversationId, user.id),
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build context (all messages up to but not including the one being regenerated)
    const msgIndex = conversation.messages.findIndex(m => m.id === messageId)
    if (msgIndex === -1) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const contextMessages = conversation.messages.slice(0, msgIndex).map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    // Trim context for the escalated model's window
    const maxTokens = getModelContextWindow(model) - 4096
    const trimmed: typeof contextMessages = []
    let tokenCount = 0
    for (let i = contextMessages.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil(contextMessages[i].content.length / 4)
      if (tokenCount + msgTokens > maxTokens && trimmed.length > 0) break
      trimmed.unshift(contextMessages[i])
      tokenCount += msgTokens
    }

    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: { 'HTTP-Referer': 'https://vibecode.new', 'X-Title': 'VibeCoder' },
    })

    const startTime = Date.now()

    const streamResult = streamText({
      model: openrouter.chat(model),
      system: SYSTEM_PROMPTS[tier],
      messages: trimmed,
    })

    // After stream completes, update the message in DB
    ;(async () => {
      const text = await streamResult.text
      const usage = await streamResult.usage
      const inputTokens = usage?.inputTokens || Math.ceil(JSON.stringify(trimmed).length / 4)
      const outputTokens = usage?.outputTokens || Math.ceil(text.length / 4)
      const latencyMs = Date.now() - startTime
      const creditsCost = calculateCredits(model, inputTokens, outputTokens)

      // Update the existing message with maestro response
      await prisma.message.update({
        where: { id: messageId },
        data: {
          content: text,
          modelUsed: model,
          routingTier: tier,
          inputTokens,
          outputTokens,
          creditsCost,
          wasEscalated: true,
          escalatedFrom: conversation.messages[msgIndex].modelUsed || 'unknown',
          latencyMs,
        },
      })

      await deductCredits(user.id, creditsCost, `Maestro regeneration: ${model}`)

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          totalCreditsUsed: { increment: creditsCost },
          updatedAt: new Date(),
        },
      })

      console.log(`[regenerate] ${model} (${tier}) replaced message ${messageId} | ${creditsCost.toFixed(2)} credits | ${(latencyMs/1000).toFixed(1)}s`)
    })()

    return streamResult.toUIMessageStreamResponse({
      headers: {
        'X-Model': model,
        'X-Tier': tier,
        'X-Regenerated': 'true',
        'X-Original-Message-Id': messageId,
      },
    })
  } catch (err) {
    const msg = process.env.NODE_ENV === 'production' ? 'Unauthorized' : (err as Error).message
    return new Response(JSON.stringify({ error: msg }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
