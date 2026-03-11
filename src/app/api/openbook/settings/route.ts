import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const OPENBOOK_SETTINGS_KEYS = [
  'openbook_cheap_model',
  'openbook_maestro_model',
  'openbook_embedding_model',
  'openbook_tts_provider',
  'openbook_tts_api_key',
  'openbook_tts_google_api_key',
  'openbook_default_audience',
  'openbook_flashcard_count',
] as const

// GET /api/openbook/settings
export async function GET() {
  try {
    await requireAuth()

    const settings = await prisma.settings.findMany({
      where: { key: { in: [...OPENBOOK_SETTINGS_KEYS] } },
    })

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]))

    return NextResponse.json({
      cheapModel: map.openbook_cheap_model || '',
      maestroModel: map.openbook_maestro_model || '',
      embeddingModel: map.openbook_embedding_model || 'openai/text-embedding-3-small',
      ttsProvider: map.openbook_tts_provider || '',
      ttsApiKey: map.openbook_tts_api_key ? '****' + map.openbook_tts_api_key.slice(-4) : '',
      ttsKeySet: !!map.openbook_tts_api_key,
      ttsGoogleApiKey: map.openbook_tts_google_api_key ? '****' + map.openbook_tts_google_api_key.slice(-4) : '',
      ttsGoogleKeySet: !!map.openbook_tts_google_api_key,
      defaultAudience: map.openbook_default_audience || 'undergraduate',
      flashcardCount: map.openbook_flashcard_count || '20',
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PUT /api/openbook/settings
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const updates: { key: string; value: string }[] = []

    if (body.cheapModel !== undefined) {
      updates.push({ key: 'openbook_cheap_model', value: body.cheapModel })
    }
    if (body.maestroModel !== undefined) {
      updates.push({ key: 'openbook_maestro_model', value: body.maestroModel })
    }
    if (body.embeddingModel !== undefined) {
      updates.push({ key: 'openbook_embedding_model', value: body.embeddingModel })
    }
    if (body.ttsProvider !== undefined) {
      updates.push({ key: 'openbook_tts_provider', value: body.ttsProvider })
    }
    if (body.ttsApiKey && !body.ttsApiKey.startsWith('****')) {
      updates.push({ key: 'openbook_tts_api_key', value: body.ttsApiKey })
    }
    if (body.ttsGoogleApiKey && !body.ttsGoogleApiKey.startsWith('****')) {
      updates.push({ key: 'openbook_tts_google_api_key', value: body.ttsGoogleApiKey })
    }
    if (body.defaultAudience !== undefined) {
      updates.push({ key: 'openbook_default_audience', value: body.defaultAudience })
    }
    if (body.flashcardCount !== undefined) {
      updates.push({ key: 'openbook_flashcard_count', value: String(body.flashcardCount) })
    }

    for (const { key, value } of updates) {
      await prisma.settings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    // Validate TTS key if OpenAI provider + key was provided
    if (body.ttsApiKey && !body.ttsApiKey.startsWith('****') && body.ttsProvider === 'openai') {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${body.ttsApiKey}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          return NextResponse.json({ saved: true, warning: 'Key saved but validation failed — check the key' })
        }
        return NextResponse.json({ saved: true, ttsValidated: true })
      } catch {
        return NextResponse.json({ saved: true, warning: 'Key saved but could not validate' })
      }
    }

    // Validate Google TTS key
    if (body.ttsGoogleApiKey && !body.ttsGoogleApiKey.startsWith('****') && body.ttsProvider === 'google') {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${body.ttsGoogleApiKey}`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          return NextResponse.json({ saved: true, warning: 'Key saved but validation failed — check the key' })
        }
        return NextResponse.json({ saved: true, ttsValidated: true })
      } catch {
        return NextResponse.json({ saved: true, warning: 'Key saved but could not validate' })
      }
    }

    return NextResponse.json({ saved: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
