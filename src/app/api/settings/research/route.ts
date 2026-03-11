import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export interface ResearchSettings {
  serperApiKey: string
  defaultDepth: 'standard' | 'extensive'
  cheapModel: string
  maestroModel: string
}

const RESEARCH_SETTINGS_KEYS = [
  'serper_api_key',
  'research_default_depth',
  'research_cheap_model',
  'research_maestro_model',
] as const

// GET /api/settings/research
export async function GET() {
  try {
    await requireAuth()

    const settings = await prisma.settings.findMany({
      where: { key: { in: [...RESEARCH_SETTINGS_KEYS] } },
    })

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]))

    return NextResponse.json({
      serperApiKey: map.serper_api_key ? '••••' + map.serper_api_key.slice(-4) : '',
      serperKeySet: !!map.serper_api_key,
      defaultDepth: map.research_default_depth || 'standard',
      cheapModel: map.research_cheap_model || 'qwen/qwen3.5-flash-02-23',
      maestroModel: map.research_maestro_model || 'anthropic/claude-sonnet-4.6',
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PUT /api/settings/research
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json() as Partial<ResearchSettings>

    const updates: { key: string; value: string }[] = []

    if (body.serperApiKey && body.serperApiKey !== '••••') {
      updates.push({ key: 'serper_api_key', value: body.serperApiKey })
    }
    if (body.defaultDepth) {
      updates.push({ key: 'research_default_depth', value: body.defaultDepth })
    }
    if (body.cheapModel) {
      updates.push({ key: 'research_cheap_model', value: body.cheapModel })
    }
    if (body.maestroModel) {
      updates.push({ key: 'research_maestro_model', value: body.maestroModel })
    }

    for (const { key, value } of updates) {
      await prisma.settings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    // Validate Serper key if it was updated
    if (body.serperApiKey && body.serperApiKey !== '••••') {
      try {
        const res = await fetch('https://google.serper.dev/account', {
          headers: { 'X-API-KEY': body.serperApiKey },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          return NextResponse.json({ error: 'Invalid Serper API key', saved: true })
        }
        const account = await res.json()
        return NextResponse.json({
          saved: true,
          serperBalance: account.balance,
          serperRateLimit: account.rateLimit,
        })
      } catch {
        return NextResponse.json({ saved: true, warning: 'Saved but could not validate key' })
      }
    }

    return NextResponse.json({ saved: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
