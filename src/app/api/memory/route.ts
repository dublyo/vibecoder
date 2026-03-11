import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getUserMemories, updateMemory, deleteMemory, deleteAllMemories } from '@/lib/memory-store'

// GET /api/memory — list all memories for current user
export async function GET() {
  try {
    const user = await requireAuth()
    const memories = await getUserMemories(user.id)
    return NextResponse.json({ memories })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PATCH /api/memory — update a memory's content
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { id, content } = await req.json()

    if (!id || !content || typeof content !== 'string') {
      return NextResponse.json({ error: 'id and content are required' }, { status: 400 })
    }

    const result = await updateMemory(id, user.id, content)
    if (result.count === 0) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// DELETE /api/memory — delete one or all memories
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { id, all } = await req.json()

    if (all === true) {
      await deleteAllMemories(user.id)
      return NextResponse.json({ ok: true, deleted: 'all' })
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const result = await deleteMemory(id, user.id)
    if (result.count === 0) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
