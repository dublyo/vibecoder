import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createSubscriberRedis } from '@/lib/research/redis'

// GET /api/research/progress?jobId=xxx — SSE stream of research progress
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()

  try {
    await requireAuth()
    const jobId = req.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check job exists
    const job = await prisma.researchJob.findUnique({ where: { id: jobId } })
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // If already completed, return the result immediately
    if (job.status === 'completed') {
      const stream = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({
            stage: 'completed',
            message: 'Research complete!',
            progress: 100,
            report: job.finalReport,
            sources: job.sources ? JSON.parse(job.sources) : [],
            totalCredits: job.totalCredits,
          })
          controller.enqueue(encoder.encode(`event: progress\ndata: ${data}\n\n`))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    if (job.status === 'failed') {
      const stream = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({
            stage: 'failed',
            message: job.errorMessage || 'Research failed',
            progress: 0,
          })
          controller.enqueue(encoder.encode(`event: progress\ndata: ${data}\n\n`))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Subscribe to Redis pub/sub for live updates
    const subscriber = createSubscriberRedis()
    const channel = `research:${jobId}`

    const stream = new ReadableStream({
      start(controller) {
        // Send current status first
        const currentData = JSON.stringify({
          stage: job.status,
          message: job.progressMessage || 'Starting research...',
          progress: job.progress,
        })
        controller.enqueue(encoder.encode(`event: progress\ndata: ${currentData}\n\n`))

        // Listen for updates
        subscriber.subscribe(channel)
        subscriber.on('message', (_ch: string, msg: string) => {
          try {
            controller.enqueue(encoder.encode(`event: progress\ndata: ${msg}\n\n`))

            // Close stream when done
            const parsed = JSON.parse(msg)
            if (parsed.stage === 'completed' || parsed.stage === 'failed') {
              setTimeout(() => {
                subscriber.unsubscribe(channel)
                subscriber.quit()
                controller.close()
              }, 500)
            }
          } catch {
            // ignore parse errors
          }
        })

        // Timeout after 15 minutes
        setTimeout(() => {
          subscriber.unsubscribe(channel)
          subscriber.quit()
          try { controller.close() } catch { /* already closed */ }
        }, 900000)
      },
      cancel() {
        subscriber.unsubscribe(channel)
        subscriber.quit()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
