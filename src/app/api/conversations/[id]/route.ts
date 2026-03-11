import { NextRequest, NextResponse } from 'next/server'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// Get conversation with messages (own or shared)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(id, user.id),
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        project: { select: { id: true, name: true, emoji: true } },
        skill: { select: { id: true, name: true, icon: true, description: true } },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ conversation })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Update conversation (title, activeModel)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    const data: Record<string, string> = {}
    if (body.title && typeof body.title === 'string') data.title = body.title.slice(0, 200)
    if (body.activeModel && typeof body.activeModel === 'string') data.activeModel = body.activeModel

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const conversation = await prisma.conversation.updateMany({
      where: { id, userId: user.id },
      data,
    })

    if (conversation.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Delete conversation
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    await prisma.conversation.deleteMany({
      where: { id, userId: user.id },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
