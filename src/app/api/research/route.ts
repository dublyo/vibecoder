import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma, conversationAccessWhere } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { getResearchQueue, startResearchWorker } from '@/lib/research/queue'
import { checkSerperCredits } from '@/lib/research/serper'

// Ensure worker is started when the API route is loaded
startResearchWorker()

// POST /api/research — Start a new research job
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { conversationId, message } = body as {
      conversationId: string
      message: string
    }

    if (!conversationId || !message?.trim()) {
      return NextResponse.json({ error: 'conversationId and message required' }, { status: 400 })
    }

    if (message.length > 32000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Get API keys
    const [openRouterKey, serperKeySetting] = await Promise.all([
      getOpenRouterKey(),
      prisma.settings.findUnique({ where: { key: 'serper_api_key' } }),
    ])

    if (!openRouterKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    if (!serperKeySetting?.value) {
      return NextResponse.json({ error: 'Serper API key not configured. Go to Settings > Web Research to add it.' }, { status: 400 })
    }

    // Validate Serper credits
    try {
      const account = await checkSerperCredits(serperKeySetting.value)
      if (account.balance < 5) {
        return NextResponse.json({ error: `Insufficient Serper credits (${account.balance} remaining). Top up at serper.dev.` }, { status: 402 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid Serper API key. Check Settings > Web Research.' }, { status: 400 })
    }

    // Check user credits
    if (user.creditsBalance <= -1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }

    // Get conversation
    const conversation = await prisma.conversation.findFirst({
      where: conversationAccessWhere(conversationId, user.id),
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conversation.chatType !== 'research') {
      return NextResponse.json({ error: 'Not a research conversation' }, { status: 400 })
    }

    // Get research settings
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['research_default_depth', 'research_cheap_model', 'research_maestro_model'] } },
    })
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]))

    const depth = (settingsMap.research_default_depth || 'standard') as 'standard' | 'extensive'
    const cheapModel = settingsMap.research_cheap_model || 'qwen/qwen3.5-flash-02-23'
    const maestroModel = settingsMap.research_maestro_model || 'anthropic/claude-sonnet-4.6'

    // Save user message
    await prisma.message.create({
      data: {
        conversationId,
        userId: user.id,
        role: 'user',
        content: message,
      },
    })

    // Create research job record
    const job = await prisma.researchJob.create({
      data: {
        conversationId,
        userId: user.id,
        query: message,
        depth,
        cheapModel,
        maestroModel,
        status: 'pending',
        progress: 0,
        progressMessage: 'Queued for processing...',
      },
    })

    // Add to BullMQ queue (phase 1: plan only, waits for approval)
    const queue = getResearchQueue()
    await queue.add('research', {
      jobId: job.id,
      conversationId,
      userId: user.id,
      query: message,
      depth,
      cheapModel,
      maestroModel,
      serperApiKey: serperKeySetting.value,
      openRouterApiKey: openRouterKey,
      phase: 'plan',
    })

    // Update conversation title if first message
    if (conversation.messageCount === 0) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: message.slice(0, 100) },
      })
    }

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      depth,
      cheapModel,
      maestroModel,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, {
      status: msg.includes('Unauthorized') ? 401 : 500,
    })
  }
}

// GET /api/research?jobId=xxx or ?jobId=latest&conversationId=xxx — Get job status
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const jobId = req.nextUrl.searchParams.get('jobId')
    const conversationId = req.nextUrl.searchParams.get('conversationId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }

    let job
    if (jobId === 'latest' && conversationId) {
      job = await prisma.researchJob.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      job = await prisma.researchJob.findUnique({
        where: { id: jobId },
      })
    }

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      query: job.query,
      depth: job.depth,
      keywords: job.keywords ? JSON.parse(job.keywords) : null,
      planMessage: job.planMessage,
      report: job.finalReport,
      sources: job.sources ? JSON.parse(job.sources) : null,
      totalCredits: job.totalCredits,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, {
      status: msg.includes('Unauthorized') ? 401 : 500,
    })
  }
}
