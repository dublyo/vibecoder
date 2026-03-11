import { NextRequest, NextResponse } from 'next/server'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getOpenRouterKey } from '@/lib/openrouter'
import { chatCompletion } from '@/lib/openrouter'
import { calculateCredits, deductCredits, MODEL_CREDIT_RATES } from '@/lib/credits'
import { getModelPreferences } from '@/lib/model-preferences'
import { TIER_MODELS } from '@/lib/router/models'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

const VALID_MODELS = new Set(Object.keys(MODEL_CREDIT_RATES))

// Default models to consult (mix of cheap + mid for diverse opinions)
const DEFAULT_CONSULTATION_MODELS = [
  'deepseek/deepseek-chat-v3-0324',
  'google/gemini-2.5-flash',
  'qwen/qwen3-coder-next',
  'minimax/minimax-m2.5',
  'inception/mercury-2',
]

// POST: Send message to multiple models, collect responses, maestro judges
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { conversationId, message, models } = body as {
      conversationId: string
      message: string
      models?: string[]
    }

    if (!conversationId || !message?.trim()) {
      return NextResponse.json({ error: 'conversationId and message are required' }, { status: 400 })
    }

    if (message.length > 32000) {
      return NextResponse.json({ error: 'Message too long (max 32000 chars)' }, { status: 400 })
    }

    // Rate limit per user
    const rl = checkRateLimit(`multimodel:${user.id}`, RATE_LIMITS.multimodel)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    // Validate user-provided models against whitelist
    if (models) {
      const invalid = models.filter(m => !VALID_MODELS.has(m))
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid models: ${invalid.join(', ')}` }, { status: 400 })
      }
    }

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    if (user.creditsBalance <= -1) {
      return NextResponse.json({ error: 'Insufficient credits. Your balance is negative from a previous request.' }, { status: 402 })
    }

    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(conversationId, user.id),
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Get prefs to determine maestro + check disabled models
    const prefs = await getModelPreferences()
    const maestroModel = prefs.maestroModel
    const disabledSet = new Set(prefs.disabledModels)

    // Determine which models to consult
    const consultModels = (models || DEFAULT_CONSULTATION_MODELS)
      .filter(m => !disabledSet.has(m))
      .slice(0, 5) // max 5 models

    if (consultModels.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 enabled models for consultation' }, { status: 400 })
    }

    // Build context
    const context = conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))
    context.push({ role: 'user', content: message })

    // Save user message
    const groupId = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await prisma.message.create({
      data: {
        conversationId,
        userId: user.id,
        role: 'user',
        content: message,
        groupId,
      },
    })

    console.log(`[multimodel] Consulting ${consultModels.length} models: ${consultModels.join(', ')}`)

    // Fan out to all models in parallel
    const startTime = Date.now()
    const modelResponses = await Promise.allSettled(
      consultModels.map(async (model) => {
        const modelStart = Date.now()
        try {
          const result = await chatCompletion(model, [
            { role: 'system', content: 'You are a helpful AI assistant. Be thorough and accurate. Format code blocks with language identifiers. Use markdown.' },
            ...context,
          ], apiKey, { temperature: 0.7, maxTokens: 4096 })

          const content = result.choices?.[0]?.message?.content || ''
          if (!content) throw new Error('Empty response from model')
          const inputTokens = result.usage?.prompt_tokens || 0
          const outputTokens = result.usage?.completion_tokens || 0
          const credits = calculateCredits(model, inputTokens, outputTokens)

          return {
            model,
            content,
            inputTokens,
            outputTokens,
            credits,
            latencyMs: Date.now() - modelStart,
          }
        } catch (err) {
          console.error(`[multimodel] ${model} failed:`, (err as Error).message)
          return null
        }
      })
    )

    // Collect successful responses
    const successfulResponses = modelResponses
      .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof chatCompletion>> & { model: string; content: string; inputTokens: number; outputTokens: number; credits: number; latencyMs: number }>> =>
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value!)

    if (successfulResponses.length === 0) {
      return NextResponse.json({ error: 'All models failed' }, { status: 500 })
    }

    console.log(`[multimodel] Got ${successfulResponses.length}/${consultModels.length} responses in ${Date.now() - startTime}ms`)

    // Save all model responses as messages
    const savedMessages = await Promise.all(
      successfulResponses.map(async (resp) => {
        const msg = await prisma.message.create({
          data: {
            conversationId,
            userId: user.id,
            role: 'assistant',
            content: resp.content,
            modelUsed: resp.model,
            routingMode: 'multimodel',
            routingTier: TIER_MODELS.cheap.includes(resp.model) ? 'cheap' : TIER_MODELS.mid.includes(resp.model) ? 'mid' : 'premium',
            inputTokens: resp.inputTokens,
            outputTokens: resp.outputTokens,
            creditsCost: resp.credits,
            latencyMs: resp.latencyMs,
            groupId,
            pipelineLog: JSON.stringify({ type: 'multimodel_candidate' }),
          },
        })
        return { ...resp, messageId: msg.id }
      })
    )

    // Maestro judges: pick the best response
    const judgeStart = Date.now()
    let judgeResult: { winnerId: string; winnerModel: string; scores: Record<string, number>; reason: string }

    try {
      const judgePrompt = buildJudgePrompt(message, savedMessages)
      const judgeResponse = await chatCompletion(maestroModel, [
        { role: 'system', content: 'You are an expert judge evaluating AI responses. Output ONLY valid JSON.' },
        { role: 'user', content: judgePrompt },
      ], apiKey, { temperature: 0.3, maxTokens: 1024 })

      const judgeText = judgeResponse.choices[0]?.message?.content || ''
      const judgeCredits = calculateCredits(
        maestroModel,
        judgeResponse.usage?.prompt_tokens || 0,
        judgeResponse.usage?.completion_tokens || 0,
      )

      // Parse judge response
      const parsed = parseJudgeResponse(judgeText, savedMessages)
      judgeResult = parsed

      // Deduct judge credits
      await deductCredits(user.id, judgeCredits, `MM Judge: ${maestroModel}`)

      console.log(`[multimodel] Maestro judged in ${Date.now() - judgeStart}ms. Winner: ${parsed.winnerModel}`)
    } catch (err) {
      console.error('[multimodel] Judge failed:', (err as Error).message)
      // Fallback: pick the longest response
      const longestResp = savedMessages.reduce((a, b) => a.content.length > b.content.length ? a : b)
      judgeResult = {
        winnerId: longestResp.messageId,
        winnerModel: longestResp.model,
        scores: Object.fromEntries(savedMessages.map(m => [m.model, 0.5])),
        reason: 'Judge failed, selected by response length',
      }
    }

    // Deduct credits for all model responses
    const totalCredits = successfulResponses.reduce((sum, r) => sum + r.credits, 0)
    await deductCredits(user.id, totalCredits, `MM Consult: ${successfulResponses.length} models`)

    // Update conversation (don't set activeModel — user picks after seeing results)
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        totalCreditsUsed: { increment: totalCredits },
        messageCount: { increment: 1 + successfulResponses.length },
        updatedAt: new Date(),
        ...(conversation.messageCount === 0 ? { title: message.slice(0, 100) } : {}),
      },
    })

    // Save scores for ALL models and mark the winner
    await Promise.all(
      savedMessages.map(async (m) => {
        const isWinner = m.messageId === judgeResult.winnerId
        await prisma.message.update({
          where: { id: m.messageId },
          data: {
            criticScore: judgeResult.scores[m.model] || 0,
            pipelineLog: JSON.stringify({
              type: isWinner ? 'multimodel_winner' : 'multimodel_candidate',
              scores: isWinner ? judgeResult.scores : undefined,
              reason: isWinner ? judgeResult.reason : undefined,
            }),
          },
        })
      })
    )

    return NextResponse.json({
      groupId,
      responses: savedMessages.map(m => ({
        messageId: m.messageId,
        model: m.model,
        content: m.content,
        latencyMs: m.latencyMs,
        credits: m.credits,
        score: judgeResult.scores[m.model] || 0,
        isWinner: m.messageId === judgeResult.winnerId,
      })),
      winner: {
        messageId: judgeResult.winnerId,
        model: judgeResult.winnerModel,
        reason: judgeResult.reason,
      },
      totalCredits,
    })
  } catch (err) {
    console.error('[multimodel] Error:', err)
    const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function buildJudgePrompt(
  userMessage: string,
  responses: { model: string; content: string; messageId: string }[],
): string {
  const responsesText = responses
    .map((r, i) => `--- Response ${i + 1} (${r.model}) ---\n${r.content.slice(0, 3000)}`)
    .join('\n\n')

  return `The user asked: "${userMessage}"

${responses.length} AI models responded. Score each response 0.0-1.0 on accuracy, completeness, and clarity. Pick the best one.

${responsesText}

Respond with ONLY this JSON format (no markdown, no code fences):
{
  "scores": { ${responses.map(r => `"${r.model}": 0.0`).join(', ')} },
  "winner": "${responses[0].model}",
  "reason": "Brief explanation"
}`
}

function parseJudgeResponse(
  text: string,
  responses: { model: string; messageId: string }[],
): { winnerId: string; winnerModel: string; scores: Record<string, number>; reason: string } {
  // Try to extract JSON from the response
  let json: { scores?: Record<string, number>; winner?: string; reason?: string } = {}

  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    json = JSON.parse(cleaned)
  } catch {
    // Try to find JSON in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { json = JSON.parse(match[0]) } catch { /* fallback below */ }
    }
  }

  const scores = json.scores || {}
  const winnerModel = json.winner || responses[0].model
  const reason = json.reason || 'Selected by maestro'

  const winnerResp = responses.find(r => r.model === winnerModel) || responses[0]

  return {
    winnerId: winnerResp.messageId,
    winnerModel: winnerResp.model,
    scores,
    reason,
  }
}
