import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDefaultModels } from '@/lib/credits'

export async function GET() {
  try {
    await requireAuth()
    const models = getDefaultModels()
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
