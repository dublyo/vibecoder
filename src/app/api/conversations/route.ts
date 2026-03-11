import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// List conversations (own + shared with me)
export async function GET() {
  try {
    const user = await requireAuth()
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { userId: user.id },
          { sharedWith: { some: { userId: user.id } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, emoji: true } },
        user: { select: { name: true } },
        sharedWith: { where: { userId: user.id }, select: { sharedByName: true } },
        _count: { select: { messages: true } },
      },
    })

    const result = conversations.map(c => ({
      ...c,
      isShared: c.userId !== user.id,
      sharedByName: c.sharedWith[0]?.sharedByName || null,
      ownerName: c.userId !== user.id ? c.user.name : null,
      sharedWith: undefined,
      user: undefined,
    }))

    return NextResponse.json({ conversations: result })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Create conversation
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json().catch(() => ({}))

    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : 'New Chat'
    const routingMode = ['auto', 'economy', 'balanced', 'premium'].includes(body.routingMode) ? body.routingMode : 'auto'
    const chatType = ['classic', 'multimodel', 'skilled', 'mcp', 'research'].includes(body.chatType) ? body.chatType : 'classic'

    // Validate projectId belongs to user
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: body.projectId, ownerId: user.id } })
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
    }

    // Validate skillId is accessible
    if (body.skillId) {
      const skill = await prisma.skill.findFirst({
        where: { id: body.skillId, OR: [{ userId: user.id }, { isPublic: true }] },
      })
      if (!skill) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title,
        projectId: body.projectId || null,
        routingMode,
        chatType,
        skillId: body.skillId || null,
        activeModel: body.activeModel || null,
      },
    })

    return NextResponse.json({ conversation })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
