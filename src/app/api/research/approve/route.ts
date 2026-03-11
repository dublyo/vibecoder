import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOpenRouterKey } from '@/lib/openrouter'
import { getResearchQueue, startResearchWorker } from '@/lib/research/queue'

startResearchWorker()

// POST /api/research/approve — Approve a research plan and start execution
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { jobId } = body as { jobId: string }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }

    const job = await prisma.researchJob.findUnique({ where: { id: jobId } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.userId !== user.id) {
      return NextResponse.json({ error: 'Not your job' }, { status: 403 })
    }

    if (job.status !== 'awaiting_approval') {
      return NextResponse.json({ error: `Job is not awaiting approval (status: ${job.status})` }, { status: 400 })
    }

    // Get API keys
    const [openRouterKey, serperKeySetting] = await Promise.all([
      getOpenRouterKey(),
      prisma.settings.findUnique({ where: { key: 'serper_api_key' } }),
    ])

    if (!openRouterKey || !serperKeySetting?.value) {
      return NextResponse.json({ error: 'API keys not configured' }, { status: 500 })
    }

    const keywords = job.keywords ? JSON.parse(job.keywords) as string[] : []
    const maxCrawlUrls = job.depth === 'extensive' ? 20 : 12

    // Update status to searching
    await prisma.researchJob.update({
      where: { id: jobId },
      data: { status: 'searching', progress: 15, progressMessage: 'Approved! Starting web search...' },
    })

    // Add phase 2 job to queue
    const queue = getResearchQueue()
    await queue.add('research', {
      jobId: job.id,
      conversationId: job.conversationId,
      userId: job.userId,
      query: job.query,
      depth: job.depth as 'standard' | 'extensive',
      cheapModel: job.cheapModel || 'openai/gpt-4o-mini',
      maestroModel: job.maestroModel || 'anthropic/claude-3.5-sonnet',
      serperApiKey: serperKeySetting.value,
      openRouterApiKey: openRouterKey,
      phase: 'execute',
      keywords,
      maxCrawlUrls,
      priorCredits: job.totalCredits,
    })

    return NextResponse.json({ status: 'approved', jobId })
  } catch (err) {
    const msg = (err as Error).message
    return NextResponse.json({ error: msg }, {
      status: msg.includes('Unauthorized') ? 401 : 500,
    })
  }
}
