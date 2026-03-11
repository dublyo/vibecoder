import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/openbook/notebooks — Create notebook
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { title, description } = await req.json()

    const notebook = await prisma.notebook.create({
      data: {
        userId: user.id,
        title: title || 'Untitled Notebook',
        description: description || null,
      },
    })

    return NextResponse.json({ notebook })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// GET /api/openbook/notebooks — List notebooks
export async function GET() {
  try {
    const user = await requireAuth()

    const notebooks = await prisma.notebook.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { sources: true, artifacts: true, conversations: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ notebooks })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
