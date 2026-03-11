import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/openbook/map/:notebookId — Get all nodes + edges
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  try {
    const user = await requireAuth()
    const { notebookId } = await params

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    const [nodes, edges] = await Promise.all([
      prisma.mapNode.findMany({
        where: { notebookId },
        orderBy: { level: 'asc' },
      }),
      prisma.mapEdge.findMany({
        where: { notebookId },
      }),
    ])

    return NextResponse.json({
      nodes: nodes.map(n => ({
        ...n,
        sourceIds: n.sourceIds ? JSON.parse(n.sourceIds) : [],
      })),
      edges,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// PUT /api/openbook/map/:notebookId — Update node positions (batch)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  try {
    const user = await requireAuth()
    const { notebookId } = await params
    const body = await req.json()
    const { updates } = body as {
      updates: Array<{ nodeId: string; x: number; y: number }>
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    for (const u of updates) {
      await prisma.mapNode.update({
        where: { id: u.nodeId },
        data: { x: u.x, y: u.y },
      })
    }

    return NextResponse.json({ updated: updates.length })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
