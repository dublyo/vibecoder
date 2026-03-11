import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// PUT /api/openbook/sources/:id — Update source (pin/unpin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    const source = await prisma.notebookSource.findFirst({
      where: { id },
      include: { notebook: { select: { userId: true } } },
    })

    if (!source || source.notebook.userId !== user.id) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    const updated = await prisma.notebookSource.update({
      where: { id },
      data: {
        pinned: body.pinned !== undefined ? body.pinned : source.pinned,
        title: body.title || source.title,
      },
    })

    return NextResponse.json({ source: updated })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// DELETE /api/openbook/sources/:id — Remove source + chunks
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const source = await prisma.notebookSource.findFirst({
      where: { id },
      include: { notebook: { select: { userId: true } } },
    })

    if (!source || source.notebook.userId !== user.id) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    await prisma.notebookSource.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
