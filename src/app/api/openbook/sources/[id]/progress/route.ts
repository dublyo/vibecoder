import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createOpenBookSubscriber } from '@/lib/openbook/redis'

// GET /api/openbook/sources/:id/progress — SSE for source processing progress
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const channel = `openbook:source:${id}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const sub = createOpenBookSubscriber()

      sub.subscribe(channel).catch(() => {
        controller.close()
      })

      sub.on('message', (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))

        try {
          const data = JSON.parse(message)
          if (data.stage === 'ready' || data.stage === 'failed') {
            setTimeout(() => {
              sub.unsubscribe(channel).catch(() => {})
              sub.quit().catch(() => {})
              controller.close()
            }, 500)
          }
        } catch {}
      })

      sub.on('error', () => {
        controller.close()
      })
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
