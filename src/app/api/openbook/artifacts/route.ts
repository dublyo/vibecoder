import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/openbook/artifacts?notebookId=x — List artifacts
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const notebookId = req.nextUrl.searchParams.get('notebookId')

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId required' }, { status: 400 })
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    const artifacts = await prisma.notebookArtifact.findMany({
      where: { notebookId },
      select: {
        id: true, type: true, title: true, status: true,
        audioUrl: true, creditsUsed: true, metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ artifacts })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
