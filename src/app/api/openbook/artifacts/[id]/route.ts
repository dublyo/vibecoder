import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/openbook/artifacts/:id — Get artifact content
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const artifact = await prisma.notebookArtifact.findFirst({
      where: { id },
      include: { notebook: { select: { userId: true } } },
    })

    if (!artifact || artifact.notebook.userId !== user.id) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    const parseContent = (raw: string | null) => {
      if (!raw) return null
      try { return JSON.parse(raw) } catch {}
      // Strip markdown code fences
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (m) { try { return JSON.parse(m[1].trim()) } catch {} }
      const j = raw.match(/[\[{][\s\S]*[\]}]/)
      if (j) { try { return JSON.parse(j[0]) } catch {} }
      return raw
    }

    return NextResponse.json({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      content: parseContent(artifact.content),
      metadata: parseContent(artifact.metadata),
      audioUrl: artifact.audioUrl,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      creditsUsed: artifact.creditsUsed,
      createdAt: artifact.createdAt,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// DELETE /api/openbook/artifacts/:id — Delete artifact
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const artifact = await prisma.notebookArtifact.findFirst({
      where: { id },
      include: { notebook: { select: { userId: true } } },
    })

    if (!artifact || artifact.notebook.userId !== user.id) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    await prisma.notebookArtifact.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
