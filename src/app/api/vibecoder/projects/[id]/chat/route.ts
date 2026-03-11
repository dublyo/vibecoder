import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { runPipeline, type PipelineEvent } from '@/lib/vibecoder/pipeline'
import { runRalphLoop } from '@/lib/vibecoder/ralph-loop'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

/** Detect if the user explicitly wants to SKIP auto-fix loop */
function shouldSkipRalphLoop(message: string): boolean {
  const lowerMsg = message.toLowerCase()
  return lowerMsg.includes('no-fix') || lowerMsg.includes('skip-fix') || lowerMsg.includes('nofix')
}

// POST /api/vibecoder/projects/[id]/chat — send message to AI pipeline
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return new Response('Project not found', { status: 404 })

  const body = await request.json()
  const { message, enableRalphLoop } = body

  if (!message?.trim()) return new Response('Message required', { status: 400 })

  // Check credits
  if (user.creditsBalance <= 0) {
    return new Response(JSON.stringify({ error: 'Insufficient credits' }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Store user message
  await prisma.vcMessage.create({
    data: {
      projectId,
      role: 'user',
      content: message,
    },
  })

  // Always monitor builds and auto-fix errors, unless explicitly disabled
  const skipRalph = enableRalphLoop === false || shouldSkipRalphLoop(message)
  const useRalphLoop = !skipRalph

  // Stream SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const publishEvent = (event: PipelineEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
      }

      try {
        const result = await runPipeline(projectId, message, publishEvent)

        // Store assistant message
        const assistantMsg = await prisma.vcMessage.create({
          data: {
            projectId,
            role: 'assistant',
            content: result.response,
            tierUsed: result.tier,
            maestroPlan: result.plan || null,
            modelUsed: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            creditsCost: result.creditsCost,
            filesChanged: result.fileChanges.length > 0
              ? JSON.stringify(result.fileChanges.map(f => f.path))
              : null,
          },
        })

        // Build file contents map for Sandpack preview
        const fileContents: Record<string, string> = {}
        for (const fc of result.fileChanges) {
          fileContents[fc.path] = fc.content
        }

        publishEvent({
          event: 'done',
          data: {
            messageId: assistantMsg.id,
            response: result.response,
            tier: result.tier,
            model: result.model,
            filesChanged: result.fileChanges.map(f => f.path),
            fileContents, // full file contents for instant Sandpack preview
            creditsCost: result.creditsCost,
          },
        })

        // Run Ralph Loop if enabled and we have a commit to monitor
        if (useRalphLoop && result.commitSha && result.fileChanges.length > 0) {
          const ralphResult = await runRalphLoop({
            projectId,
            initialMessage: message,
            initialFileChanges: result.fileChanges,
            commitSha: result.commitSha,
            publishEvent,
          })

          // If Ralph Loop made fixes, send updated file contents for Sandpack
          if (ralphResult.success && ralphResult.totalAttempts > 0) {
            publishEvent({
              event: 'ralph_summary',
              data: {
                success: true,
                attempts: ralphResult.totalAttempts,
                totalCredits: ralphResult.totalCredits,
              },
            })
          } else if (!ralphResult.success) {
            publishEvent({
              event: 'ralph_summary',
              data: {
                success: false,
                attempts: ralphResult.totalAttempts,
                totalCredits: ralphResult.totalCredits,
                finalError: ralphResult.finalError?.slice(0, 300),
              },
            })
          }
        }
      } catch (err: any) {
        publishEvent({ event: 'error', data: { message: err.message } })

        // Store error message
        await prisma.vcMessage.create({
          data: {
            projectId,
            role: 'error',
            content: `Pipeline error: ${err.message}`,
          },
        })
      } finally {
        controller.close()
      }
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
