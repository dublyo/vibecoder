import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenBookQueue, startOpenBookWorker } from '@/lib/openbook/queue'

startOpenBookWorker()

// POST /api/openbook/generate-audio — Generate audio from an edited podcast script
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { artifactId, script } = body as {
      artifactId: string
      script: string // JSON stringified PodcastScript
    }

    if (!artifactId || !script) {
      return NextResponse.json({ error: 'artifactId and script required' }, { status: 400 })
    }

    // Validate script JSON
    try {
      const parsed = JSON.parse(script)
      if (!parsed.speakers || !parsed.segments) {
        return NextResponse.json({ error: 'Invalid script: must have speakers and segments' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON script' }, { status: 400 })
    }

    const artifact = await prisma.notebookArtifact.findFirst({
      where: { id: artifactId },
      include: { notebook: { select: { id: true, userId: true } } },
    })

    if (!artifact || artifact.notebook.userId !== user.id) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    if (artifact.type !== 'podcast') {
      return NextResponse.json({ error: 'Only podcast artifacts support audio generation' }, { status: 400 })
    }

    // Get language from metadata
    const metadata = artifact.metadata ? JSON.parse(artifact.metadata) : {}
    const language = metadata.language || 'English'

    // Update the artifact content with the (potentially edited) script
    await prisma.notebookArtifact.update({
      where: { id: artifactId },
      data: { content: script, status: 'pending' },
    })

    // Queue audio generation job
    const queue = getOpenBookQueue()
    await queue.add('generate-audio', {
      type: 'generate-audio',
      notebookId: artifact.notebook.id,
      artifactId,
      userId: user.id,
      script,
      language,
      cheapModel: '',
      maestroModel: '',
      openRouterApiKey: '',
    })

    return NextResponse.json({
      artifactId,
      status: 'pending',
      message: 'Audio generation started',
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
