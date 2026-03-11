import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { hybridSearch } from '@/lib/openbook/search'

// POST /api/openbook/search — Hybrid search across notebook sources
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { notebookId, query, limit } = await req.json()

    if (!notebookId || !query?.trim()) {
      return NextResponse.json({ error: 'notebookId and query required' }, { status: 400 })
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const results = await hybridSearch(query, notebookId, apiKey, { limit: limit || 10 })

    return NextResponse.json({ results })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
