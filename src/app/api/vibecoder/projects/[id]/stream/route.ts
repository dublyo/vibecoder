import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

// GET /api/vibecoder/projects/[id]/stream — SSE for deploy status
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return new Response('Project not found', { status: 404 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`))
      }

      // Send current project status
      send('status', { status: project.status })

      // Poll for deployment updates every 3 seconds
      let lastDeploymentId = ''
      let iterations = 0
      const maxIterations = 200 // ~10 min max

      const interval = setInterval(async () => {
        iterations++
        if (iterations > maxIterations) {
          clearInterval(interval)
          controller.close()
          return
        }

        try {
          const latestDeploy = await prisma.vcDeployment.findFirst({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
          })

          if (latestDeploy && latestDeploy.id !== lastDeploymentId) {
            lastDeploymentId = latestDeploy.id
            send('deployment_update', {
              id: latestDeploy.id,
              status: latestDeploy.status,
              commitSha: latestDeploy.commitSha,
              errorType: latestDeploy.errorType,
            })
          }

          // Check project status changes
          const currentProject = await prisma.vcProject.findUnique({ where: { id: projectId } })
          if (currentProject && currentProject.status !== project.status) {
            send('status', { status: currentProject.status })
          }

          // Close stream if deploy completed or failed
          if (latestDeploy && ['live', 'failed'].includes(latestDeploy.status)) {
            send('stream_end', { reason: `Deployment ${latestDeploy.status}` })
            clearInterval(interval)
            controller.close()
          }
        } catch {
          // Ignore polling errors
        }
      }, 3000)

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        try { controller.close() } catch {}
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
