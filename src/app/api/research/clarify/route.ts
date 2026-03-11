import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { generateClarifyingQuestion } from '@/lib/research/ai'

// POST /api/research/clarify — Generate adaptive clarifying question
export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const { query, step, previousAnswers } = body as {
      query: string
      step: number
      previousAnswers: Array<{ question: string; answer: string }>
    }

    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    if (!step || step < 1 || step > 3) {
      return NextResponse.json({ error: 'step must be 1, 2, or 3' }, { status: 400 })
    }

    const openRouterKey = await getOpenRouterKey()
    if (!openRouterKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    // Use the cheap model for clarification
    const cheapModelSetting = await prisma.settings.findUnique({
      where: { key: 'research_cheap_model' },
    })
    const model = cheapModelSetting?.value || 'qwen/qwen3.5-flash-02-23'

    const result = await generateClarifyingQuestion(
      query,
      step,
      previousAnswers || [],
      model,
      openRouterKey,
    )

    return NextResponse.json({
      question: result.question,
      choices: result.choices,
      summary: result.summary || null,
      step,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, {
      status: msg.includes('Unauthorized') ? 401 : 500,
    })
  }
}
