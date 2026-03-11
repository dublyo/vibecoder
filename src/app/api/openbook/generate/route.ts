import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { getOpenBookQueue, startOpenBookWorker } from '@/lib/openbook/queue'

startOpenBookWorker()

const VALID_TYPES = ['summary', 'flashcards', 'studyguide', 'podcast', 'mindmap']

// POST /api/openbook/generate — Generate an artifact
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { notebookId, type, options } = body as {
      notebookId: string
      type: string
      options?: Record<string, unknown>
    }

    if (!notebookId || !type) {
      return NextResponse.json({ error: 'notebookId and type required' }, { status: 400 })
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
      include: { _count: { select: { sources: { where: { status: 'ready' } } } } },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    if (notebook._count.sources === 0) {
      return NextResponse.json({ error: 'No ready sources in notebook. Add and process sources first.' }, { status: 400 })
    }

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    if (user.creditsBalance <= -1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }

    // Get model settings
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['openbook_cheap_model', 'openbook_maestro_model', 'research_cheap_model', 'research_maestro_model'] } },
    })
    const sm = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const cheapModel = sm.openbook_cheap_model || sm.research_cheap_model || 'qwen/qwen3.5-flash-02-23'
    const maestroModel = sm.openbook_maestro_model || sm.research_maestro_model || 'anthropic/claude-sonnet-4.6'

    const typeLabels: Record<string, string> = {
      summary: 'Summary',
      flashcards: 'Flashcards',
      studyguide: 'Study Guide',
      podcast: 'Podcast',
      mindmap: 'Mind Map',
    }

    // Create artifact record
    const artifact = await prisma.notebookArtifact.create({
      data: {
        notebookId,
        type,
        title: `${typeLabels[type]} — ${notebook.title}`,
        content: '',
        metadata: options ? JSON.stringify(options) : null,
        status: 'pending',
      },
    })

    // Queue generation job
    const queue = getOpenBookQueue()
    await queue.add('generate', {
      type: 'generate',
      notebookId,
      artifactId: artifact.id,
      artifactType: type,
      userId: user.id,
      cheapModel,
      maestroModel,
      openRouterApiKey: apiKey,
      options,
    })

    return NextResponse.json({
      artifactId: artifact.id,
      type,
      status: 'pending',
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
