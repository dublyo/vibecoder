import { NextRequest, NextResponse } from 'next/server'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const format = req.nextUrl.searchParams.get('format') || 'json'

    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(id, user.id),
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (format === 'text') {
      const text = conversation.messages
        .map(m => `[${m.role.toUpperCase()}]\n${m.content}\n`)
        .join('\n---\n\n')
      const header = `# ${conversation.title}\n# Exported ${new Date().toISOString()}\n\n`
      return new NextResponse(header + text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${conversation.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt"`,
        },
      })
    }

    // JSON format
    const data = {
      title: conversation.title,
      exportedAt: new Date().toISOString(),
      routingMode: conversation.routingMode,
      messageCount: conversation.messages.length,
      messages: conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
        model: m.modelUsed,
        tier: m.routingTier,
        credits: m.creditsCost,
        latencyMs: m.latencyMs,
        timestamp: m.createdAt,
      })),
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${conversation.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
