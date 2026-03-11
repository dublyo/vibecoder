import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { sendSharedConversation } from '@/lib/email'
import { z } from 'zod'

const shareSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(10),
})

// Share conversation via email (admin/owner only)
// Creates shared access records so recipients can view and interact with the conversation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['owner', 'admin'])
    const { id } = await params
    const body = await req.json()

    const parsed = shareSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provide 1-10 valid email addresses' }, { status: 400 })
    }

    // Admin can share any conversation in the system
    const conversation = await prisma.conversation.findFirst({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, modelUsed: true },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { emails } = parsed.data

    // Validate all emails belong to existing active users
    const recipients = await prisma.user.findMany({
      where: { email: { in: emails }, isActive: true },
      select: { id: true, email: true, name: true },
    })

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No matching members found. Recipients must be existing users.' }, { status: 400 })
    }

    // Create shared access records (upsert to avoid duplicates)
    await Promise.all(
      recipients.map(r =>
        prisma.sharedConversation.upsert({
          where: { conversationId_userId: { conversationId: id, userId: r.id } },
          create: { conversationId: id, userId: r.id, sharedByName: user.name },
          update: {},
        })
      )
    )

    // Send email notifications (fire and forget)
    const emailResults = await Promise.allSettled(
      recipients.map(r =>
        sendSharedConversation(r.email, user.name, conversation.title, conversation.messages)
      )
    )

    const sent = emailResults.filter(r => r.status === 'fulfilled' && r.value).length
    return NextResponse.json({ sent, total: recipients.length, shared: recipients.length })
  } catch (err) {
    const msg = (err as Error)?.message
    if (msg === 'Unauthorized' || msg === 'Forbidden' || msg === 'Account disabled') {
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to share' }, { status: 500 })
  }
}
