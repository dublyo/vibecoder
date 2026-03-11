import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getModelPreferences, setModelPreferences, getAvailableModels } from '@/lib/model-preferences'
import { z } from 'zod'

const prefsSchema = z.object({
  maestroModel: z.string().max(200).optional(),
  preferredModels: z.object({
    cheap: z.array(z.string().max(200)).max(20),
    mid: z.array(z.string().max(200)).max(20),
    premium: z.array(z.string().max(200)).max(20),
  }).optional(),
  disabledModels: z.array(z.string().max(200)).max(50).optional(),
}).strict()

// GET /api/settings/models — get current model preferences + available models
export async function GET() {
  try {
    await requireAuth()
    const [preferences, models] = await Promise.all([
      getModelPreferences(),
      Promise.resolve(getAvailableModels()),
    ])
    return NextResponse.json({ preferences, models })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PUT /api/settings/models — update model preferences (admin only)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = prefsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid preferences format' }, { status: 400 })
    }
    const updated = await setModelPreferences(parsed.data)
    return NextResponse.json({ preferences: updated })
  } catch (err) {
    const msg = process.env.NODE_ENV === 'production' ? 'Failed to update preferences' : (err as Error).message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
