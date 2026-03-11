import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { getOpenBookQueue, startOpenBookWorker } from '@/lib/openbook/queue'

// Ensure worker is started
startOpenBookWorker()

// POST /api/openbook/sources — Add source to notebook
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    const contentType = req.headers.get('content-type') || ''
    let notebookId: string
    let type: string
    let title: string
    let rawContent = ''
    let url: string | null = null
    let fileName: string | null = null
    let mimeType: string | null = null

    if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await req.formData()
      notebookId = formData.get('notebookId') as string
      title = formData.get('title') as string || ''
      type = 'file'

      const file = formData.get('file') as File
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      fileName = file.name
      mimeType = file.type
      title = title || file.name

      // Extract text based on file type
      if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        rawContent = await file.text()
      } else if (file.type === 'application/pdf') {
        // PDF parsing will be done in the worker if pdf-parse is available
        // For now, store the raw text from the file
        rawContent = await file.text()
      } else {
        // Store raw text content
        rawContent = await file.text()
      }
    } else {
      // JSON body: URL or text
      const body = await req.json()
      notebookId = body.notebookId
      type = body.type || 'text'
      title = body.title || ''
      rawContent = body.content || ''
      url = body.url || null

      if (type === 'url' && !url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 })
      }

      if (type === 'text' && !rawContent.trim()) {
        return NextResponse.json({ error: 'Content is required' }, { status: 400 })
      }

      if (type === 'url') {
        title = title || url!
      }
    }

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 })
    }

    // Verify notebook ownership
    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId: user.id },
    })
    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 })
    }

    const apiKey = await getOpenRouterKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    // Get OpenBook settings
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['openbook_cheap_model', 'research_cheap_model'] } },
    })
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const cheapModel = settingsMap.openbook_cheap_model || settingsMap.research_cheap_model || 'qwen/qwen3.5-flash-02-23'

    // Create source record
    const source = await prisma.notebookSource.create({
      data: {
        notebookId,
        type,
        title: title || 'Untitled Source',
        fileName,
        url,
        mimeType,
        rawContent: rawContent || '',
        status: 'pending',
      },
    })

    // Queue processing job
    const queue = getOpenBookQueue()
    await queue.add('ingest', {
      type: 'ingest',
      sourceId: source.id,
      userId: user.id,
      cheapModel,
      maestroModel: '',
      openRouterApiKey: apiKey,
    })

    return NextResponse.json({
      source: {
        id: source.id,
        type: source.type,
        title: source.title,
        status: source.status,
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}

// GET /api/openbook/sources?notebookId=x — List sources
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

    const sources = await prisma.notebookSource.findMany({
      where: { notebookId },
      select: {
        id: true, type: true, title: true, fileName: true, url: true,
        mimeType: true, summary: true, wordCount: true, tokenCount: true,
        status: true, errorMessage: true, pinned: true, createdAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ sources })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 })
  }
}
