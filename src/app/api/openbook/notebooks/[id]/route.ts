import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/openbook/notebooks/:id — Get notebook with sources + artifacts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const notebook = await prisma.notebook.findFirst({
      where: { id, userId: user.id },
      include: {
        sources: {
          select: {
            id: true, type: true, title: true, fileName: true, url: true,
            mimeType: true, summary: true, wordCount: true, tokenCount: true,
            status: true, errorMessage: true, pinned: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        artifacts: {
          select: {
            id: true, type: true, title: true, status: true,
            audioUrl: true, creditsUsed: true, createdAt: true,
            metadata: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        conversations: {
          select: { id: true, title: true, messageCount: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
        _count: { select: { mapNodes: true, mapEdges: true } },
      },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    return NextResponse.json({ notebook })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// PUT /api/openbook/notebooks/:id — Update title/description
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    const notebook = await prisma.notebook.findFirst({
      where: { id, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    const updated = await prisma.notebook.update({
      where: { id },
      data: {
        title: body.title ?? notebook.title,
        description: body.description !== undefined ? body.description : notebook.description,
      },
    })

    return NextResponse.json({ notebook: updated })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// DELETE /api/openbook/notebooks/:id — Delete notebook + all data
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const notebook = await prisma.notebook.findFirst({
      where: { id, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    await prisma.notebook.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
