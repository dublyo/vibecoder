import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/openbook/chat/:chatId — Get chat history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const user = await requireAuth()
    const { chatId } = await params

    const conversation = await prisma.conversation.findFirst({
      where: { id: chatId, userId: user.id, chatType: 'openbook' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, role: true, content: true, modelUsed: true,
            creditsCost: true, createdAt: true,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      notebookId: conversation.notebookId,
      messages: conversation.messages,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// DELETE /api/openbook/chat/:chatId — Delete chat
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const user = await requireAuth()
    const { chatId } = await params

    const conversation = await prisma.conversation.findFirst({
      where: { id: chatId, userId: user.id, chatType: 'openbook' },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    await prisma.conversation.delete({ where: { id: chatId } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
