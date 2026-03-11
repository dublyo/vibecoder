import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// Unified message shape for aggregation
interface UnifiedMsg {
  modelUsed: string
  tier: string
  inputTokens: number
  outputTokens: number
  creditsCost: number
  latencyMs: number
  wasEscalated: boolean
  criticScore: number | null
  createdAt: Date
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || 'week' // day, week, month

    // Calculate date range
    const now = new Date()
    let since: Date
    if (period === 'day') {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }

    // Fetch from both tables in parallel
    const [chatMessages, vcMessages] = await Promise.all([
      // Old /chat route messages (Message table)
      prisma.message.findMany({
        where: {
          userId: user.id,
          role: 'assistant',
          createdAt: { gte: since },
          modelUsed: { not: null },
        },
        select: {
          modelUsed: true,
          routingTier: true,
          inputTokens: true,
          outputTokens: true,
          creditsCost: true,
          wasEscalated: true,
          criticScore: true,
          latencyMs: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // VibeCoder IDE messages (VcMessage table, joined through VcProject)
      prisma.vcMessage.findMany({
        where: {
          role: 'assistant',
          createdAt: { gte: since },
          modelUsed: { not: null },
          project: { userId: user.id },
        },
        select: {
          modelUsed: true,
          tierUsed: true,
          inputTokens: true,
          outputTokens: true,
          creditsCost: true,
          latencyMs: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Normalize into unified shape
    const messages: UnifiedMsg[] = [
      ...chatMessages.map(m => ({
        modelUsed: m.modelUsed!,
        tier: m.routingTier || 'unknown',
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        creditsCost: m.creditsCost,
        latencyMs: m.latencyMs,
        wasEscalated: m.wasEscalated,
        criticScore: m.criticScore,
        createdAt: m.createdAt,
      })),
      ...vcMessages.map(m => ({
        modelUsed: m.modelUsed!,
        tier: m.tierUsed || 'unknown',
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        creditsCost: m.creditsCost,
        latencyMs: m.latencyMs,
        wasEscalated: false,
        criticScore: null,
        createdAt: m.createdAt,
      })),
    ]

    // Sort combined messages by date desc
    messages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Aggregate by model
    const byModel: Record<string, {
      model: string
      tier: string
      messageCount: number
      inputTokens: number
      outputTokens: number
      totalCredits: number
      avgLatencyMs: number
      escalationCount: number
      avgCriticScore: number | null
      criticCount: number
    }> = {}

    for (const msg of messages) {
      const model = msg.modelUsed
      if (!byModel[model]) {
        byModel[model] = {
          model,
          tier: msg.tier,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCredits: 0,
          avgLatencyMs: 0,
          escalationCount: 0,
          avgCriticScore: null,
          criticCount: 0,
        }
      }
      const entry = byModel[model]
      entry.messageCount++
      entry.inputTokens += msg.inputTokens
      entry.outputTokens += msg.outputTokens
      entry.totalCredits += msg.creditsCost
      entry.avgLatencyMs += msg.latencyMs
      if (msg.wasEscalated) entry.escalationCount++
      if (msg.criticScore !== null) {
        entry.avgCriticScore = (entry.avgCriticScore || 0) + msg.criticScore
        entry.criticCount++
      }
    }

    // Finalize averages
    const modelStats = Object.values(byModel).map(entry => ({
      ...entry,
      avgLatencyMs: entry.messageCount > 0 ? Math.round(entry.avgLatencyMs / entry.messageCount) : 0,
      avgCriticScore: entry.criticCount > 0 ? (entry.avgCriticScore! / entry.criticCount) : null,
    }))

    // Sort by message count (most used first)
    modelStats.sort((a, b) => b.messageCount - a.messageCount)

    // Aggregate by tier
    const byTier: Record<string, { tier: string; messageCount: number; totalCredits: number; totalTokens: number }> = {}
    for (const msg of messages) {
      const tier = msg.tier
      if (!byTier[tier]) {
        byTier[tier] = { tier, messageCount: 0, totalCredits: 0, totalTokens: 0 }
      }
      byTier[tier].messageCount++
      byTier[tier].totalCredits += msg.creditsCost
      byTier[tier].totalTokens += msg.inputTokens + msg.outputTokens
    }

    // Pipeline role breakdown
    const pipelineStats = {
      totalMessages: messages.length,
      classified: messages.length,
      criticEvaluated: messages.filter(m => m.criticScore !== null).length,
      escalated: messages.filter(m => m.wasEscalated).length,
      avgCriticScore: (() => {
        const scored = messages.filter(m => m.criticScore !== null)
        if (scored.length === 0) return null
        return scored.reduce((sum, m) => sum + m.criticScore!, 0) / scored.length
      })(),
    }

    // Daily breakdown for chart
    const dailyMap: Record<string, { date: string; messages: number; credits: number; tokens: number }> = {}
    for (const msg of messages) {
      const dateKey = msg.createdAt.toISOString().split('T')[0]
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, messages: 0, credits: 0, tokens: 0 }
      }
      dailyMap[dateKey].messages++
      dailyMap[dateKey].credits += msg.creditsCost
      dailyMap[dateKey].tokens += msg.inputTokens + msg.outputTokens
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    // Totals
    const totalInputTokens = messages.reduce((s, m) => s + m.inputTokens, 0)
    const totalOutputTokens = messages.reduce((s, m) => s + m.outputTokens, 0)
    const totalCredits = messages.reduce((s, m) => s + m.creditsCost, 0)

    // Cost if all requests used most expensive maestro model (Claude Opus 4.6: 5.0/25.0 per 1K tokens)
    const maestroCost = (totalInputTokens / 1000) * 5.0 + (totalOutputTokens / 1000) * 25.0

    const totals = {
      messages: messages.length,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      credits: totalCredits,
      maestroCost,
      costSaved: maestroCost - totalCredits,
      savingsPercent: maestroCost > 0 ? ((maestroCost - totalCredits) / maestroCost) * 100 : 0,
      avgLatencyMs: messages.length > 0
        ? Math.round(messages.reduce((s, m) => s + m.latencyMs, 0) / messages.length)
        : 0,
    }

    return NextResponse.json({
      period,
      since: since.toISOString(),
      totals,
      modelStats,
      tierStats: Object.values(byTier),
      pipelineStats,
      daily,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
