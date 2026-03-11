import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { type UIMessage } from 'ai'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getOpenRouterKey } from '@/lib/openrouter'
import { type RoutingMode } from '@/lib/router/engine'
import { executePipeline, evaluateAndEscalate } from '@/lib/router/pipeline'
import { calculateCredits, deductCredits, MODEL_CREDIT_RATES } from '@/lib/credits'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { getMemoryBlock, extractMemories } from '@/lib/memory-store'

const VALID_ROUTING_MODES = ['auto', 'economy', 'balanced', 'premium'] as const
const VALID_MODELS = new Set(Object.keys(MODEL_CREDIT_RATES))

// Tier-aware system prompts:
const BASE_PROMPTS = {
  cheap: `You are VibeCoder, a helpful AI assistant. Be concise and accurate. Answer directly without unnecessary preamble. Format code blocks with language identifiers. Use markdown for formatting.`,

  mid: `You are VibeCoder, a capable AI assistant. Provide clear, well-structured answers. For coding tasks, include working examples. For analysis, cover key points thoroughly. Format code blocks with language identifiers. Use markdown.`,

  premium: `You are VibeCoder, a world-class AI assistant. You are being called because this task requires exceptional quality. Provide comprehensive, accurate, and nuanced responses. For coding: production-quality code with error handling. For analysis: thorough evaluation with multiple perspectives. For creative work: original, polished output. Format code blocks with language identifiers. Use markdown.`,
} as const

function buildSystemPrompt(tier: 'cheap' | 'mid' | 'premium', memoryBlock: string): string {
  const base = BASE_PROMPTS[tier]
  if (!memoryBlock) return base
  return `${memoryBlock}\n\n---\n\n${base}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages: clientMessages, conversationId, routingMode: mode, forceModel } = body as {
      messages: UIMessage[]
      conversationId?: string
      routingMode?: RoutingMode
      forceModel?: string
    }

    // Validate forceModel against whitelist
    if (forceModel && !VALID_MODELS.has(forceModel)) {
      return new Response(JSON.stringify({ error: 'Invalid model' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate routing mode
    if (mode && !VALID_ROUTING_MODES.includes(mode as typeof VALID_ROUTING_MODES[number])) {
      return new Response(JSON.stringify({ error: 'Invalid routing mode' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const lastMessage = clientMessages[clientMessages.length - 1]
    const userText = (lastMessage.parts ?? [])
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('') || ''

    if (!userText.trim() || userText.length > 32000) {
      return new Response(JSON.stringify({ error: !userText.trim() ? 'Message is required' : 'Message too long (max 32000 chars)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const [user, apiKey] = await Promise.all([
      requireAuth(),
      getOpenRouterKey(),
    ])

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Rate limit per user
    const rl = checkRateLimit(`chat:${user.id}`, RATE_LIMITS.chat)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    if (user.creditsBalance <= -1) {
      return new Response(JSON.stringify({ error: 'Insufficient credits. Your balance is negative from a previous request.' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: conversationAccessWhere(conversationId, user.id),
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            skill: true,
          },
        })
      : null

    if (!conversation && conversationId) {
      conversation = await prisma.conversation.create({
        data: {
          id: conversationId,
          userId: user.id,
          title: userText.slice(0, 100),
          routingMode: mode || 'auto',
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          skill: true,
        },
      })
    }

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Load user memories (fast, ~2ms from SQLite)
    const memoryBlock = await getMemoryBlock(user.id)

    // MCP chat uses its own endpoint (/api/chat/mcp)
    if (conversation.chatType === 'mcp') {
      return new Response(JSON.stringify({ error: 'MCP chat uses /api/chat/mcp endpoint' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Research chat uses its own endpoint (/api/research)
    if (conversation.chatType === 'research') {
      return new Response(JSON.stringify({ error: 'Research chat uses /api/research endpoint' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Route based on chat type
    if (conversation.chatType === 'skilled') {
      return handleSkilledChat(conversation, userText, user, apiKey, memoryBlock)
    }

    // Multimodel follow-up: use the chosen model directly (skip routing)
    if (conversation.chatType === 'multimodel' && (forceModel || conversation.activeModel)) {
      return handleSkilledChat(
        { ...conversation, activeModel: forceModel || conversation.activeModel, skill: null },
        userText, user, apiKey, memoryBlock
      )
    }

    // Classic chat (default)
    return handleClassicChat(conversation, userText, user, apiKey, mode, memoryBlock)
  } catch (err) {
    const msg = process.env.NODE_ENV === 'production' ? 'Unauthorized' : (err as Error).message
    return new Response(JSON.stringify({ error: msg }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ═══════════════════════════════════════════════
// SKILLED CHAT: Use skill as system prompt, user-chosen model, skip routing
// ═══════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSkilledChat(
  conversation: any,
  userText: string,
  user: { id: string; creditsBalance: number },
  apiKey: string,
  memoryBlock: string = '',
) {
  const model = conversation!.activeModel
  if (!model) {
    return new Response(JSON.stringify({ error: 'No model selected for skilled chat' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const skillContent = conversation!.skill?.content || ''
  const memoryPrefix = memoryBlock ? `${memoryBlock}\n\n---\n\n` : ''
  const systemPrompt = skillContent
    ? `${memoryPrefix}${skillContent}\n\n---\nYou are responding in a skilled chat session using the "${conversation!.skill?.name}" skill. Follow the instructions above carefully.`
    : buildSystemPrompt('mid', memoryBlock)

  // Save user message
  const saveUserMsg = prisma.message.create({
    data: {
      conversationId: conversation!.id,
      userId: user.id,
      role: 'user',
      content: userText,
    },
  })

  // Build context
  const existingMessages = conversation!.messages!.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))
  existingMessages.push({ role: 'user' as const, content: userText })

  const openrouter = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://vibecode.new',
      'X-Title': 'VibeCoder',
    },
  })

  const startTime = Date.now()
  console.log(`[skilled-chat] Using model ${model} with skill "${conversation!.skill?.name}"`)

  const stream = streamText({
    model: openrouter.chat(model),
    system: systemPrompt,
    messages: existingMessages,
  })

  // Persist after stream
  ;(async () => {
    const text = await stream.text
    const usage = await stream.usage
    const inputTokens = usage?.inputTokens || Math.ceil(JSON.stringify(existingMessages).length / 4)
    const outputTokens = usage?.outputTokens || Math.ceil(text.length / 4)
    const latencyMs = Date.now() - startTime
    const creditsCost = calculateCredits(model, inputTokens, outputTokens)

    await saveUserMsg

    await prisma.message.create({
      data: {
        conversationId: conversation!.id,
        userId: user.id,
        role: 'assistant',
        content: text,
        modelUsed: model,
        routingMode: 'skilled',
        routingTier: 'skilled',
        inputTokens,
        outputTokens,
        creditsCost,
        latencyMs,
        pipelineLog: JSON.stringify({ type: 'skilled', skill: conversation!.skill?.name, model }),
      },
    })

    await deductCredits(user.id, creditsCost, `Skilled: ${model}`)

    await prisma.conversation.update({
      where: { id: conversation!.id },
      data: {
        totalCreditsUsed: { increment: creditsCost },
        messageCount: { increment: 2 },
        updatedAt: new Date(),
        ...(conversation!.messageCount === 0 ? { title: userText.slice(0, 100) } : {}),
      },
    })

    // Increment skill usage count
    if (conversation!.skillId) {
      await prisma.skill.update({
        where: { id: conversation!.skillId },
        data: { usageCount: { increment: 1 } },
      })
    }

    // Extract memories async (fire-and-forget)
    extractMemories(user.id, userText, text, conversation!.id, apiKey).catch(() => {})
  })()

  return stream.toUIMessageStreamResponse({
    headers: {
      'X-Model': model,
      'X-Tier': 'skilled',
      'X-Chat-Type': 'skilled',
    },
  })
}

// ═══════════════════════════════════════════════
// CLASSIC CHAT: Full routing pipeline
// ═══════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleClassicChat(
  conversation: any,
  userText: string,
  user: { id: string; creditsBalance: number },
  apiKey: string,
  mode?: RoutingMode,
  memoryBlock: string = '',
) {
  const routingModeFinal = (mode || conversation!.routingMode || 'auto') as RoutingMode

  const saveUserMsg = prisma.message.create({
    data: {
      conversationId: conversation!.id,
      userId: user.id,
      role: 'user',
      content: userText,
    },
  })

  const existingMessages = conversation!.messages!.map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
  }))
  existingMessages.push({ role: 'user', content: userText })

  const startTime = Date.now()
  console.log(`[chat] Starting pipeline for conversation ${conversation!.id}`)

  const pipeline = await executePipeline({
    message: userText,
    context: existingMessages,
    contextSummary: conversation!.contextSummary,
    routingMode: routingModeFinal,
    apiKey,
    conversationId: conversation!.id,
    getSystemPrompt: (tier: 'cheap' | 'mid' | 'premium') => buildSystemPrompt(tier, memoryBlock),
  })

  console.log(`[chat] Pipeline decided in ${Date.now() - startTime}ms -> ${pipeline.model} (${pipeline.tier}, ${pipeline.complexity})`)

  const pipelineHeaders = {
    'X-Model': pipeline.model,
    'X-Tier': pipeline.tier,
    'X-Confidence': String(pipeline.confidence),
    'X-Task-Type': pipeline.taskType,
    'X-Complexity': pipeline.complexity,
    'X-Escalated': String(pipeline.wasEscalated),
    'X-Escalated-From': pipeline.escalatedFrom || '',
    'X-Critic-Score': pipeline.criticScore !== undefined ? String(pipeline.criticScore) : '',
    'X-Conversation-Id': conversation!.id,
    'X-Chat-Type': 'classic',
  }

  const streamResult = pipeline.stream

  ;(async () => {
    const text = await streamResult.text
    const usage = await streamResult.usage
    const inputTokens = usage?.inputTokens || Math.ceil(JSON.stringify(existingMessages).length / 4)
    const outputTokens = usage?.outputTokens || Math.ceil(text.length / 4)
    const latencyMs = Date.now() - startTime
    let totalCreditsCost = calculateCredits(pipeline.model, inputTokens, outputTokens)
    totalCreditsCost += pipeline.pipelineLog.totalCost

    await saveUserMsg

    const assistantMsg = await prisma.message.create({
      data: {
        conversationId: conversation!.id,
        userId: user.id,
        role: 'assistant',
        content: text,
        modelUsed: pipeline.model,
        routingMode: routingModeFinal,
        routingTier: pipeline.tier,
        inputTokens,
        outputTokens,
        creditsCost: totalCreditsCost,
        confidenceScore: pipeline.confidence,
        wasEscalated: false,
        escalatedFrom: null,
        criticScore: null,
        pipelineLog: JSON.stringify(pipeline.pipelineLog),
        latencyMs,
      },
    })

    await deductCredits(
      user.id,
      totalCreditsCost,
      `Chat: ${pipeline.model}`,
    )

    await prisma.conversation.update({
      where: { id: conversation!.id },
      data: {
        totalCreditsUsed: { increment: totalCreditsCost },
        messageCount: { increment: 2 },
        updatedAt: new Date(),
        ...(conversation!.messageCount === 0 ? { title: userText.slice(0, 100) } : {}),
      },
    })

    if (pipeline.shouldRunCritic && text.length > 0) {
      try {
        const escalation = await evaluateAndEscalate({
          messageId: assistantMsg.id,
          userMessage: userText,
          assistantResponse: text,
          conversationId: conversation!.id,
          taskType: pipeline.taskType,
          currentModel: pipeline.model,
          currentTier: pipeline.tier,
          apiKey,
        })

        await prisma.message.update({
          where: { id: assistantMsg.id },
          data: {
            criticScore: escalation.criticScore,
            ...(escalation.shouldEscalate ? {
              wasEscalated: false,
              escalatedFrom: `needs_escalation:${escalation.escalatedModel}`,
            } : {}),
          },
        })
      } catch (err) {
        console.error('[critic] Error:', (err as Error).message)
      }
    }

    // Extract memories async (fire-and-forget, alongside critic)
    extractMemories(user.id, userText, text, conversation!.id, apiKey).catch(() => {})
  })()

  return streamResult.toUIMessageStreamResponse({ headers: pipelineHeaders })
}
