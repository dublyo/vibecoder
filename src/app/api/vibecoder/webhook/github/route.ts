import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/vibecoder/webhook/github — GitHub Actions build callback
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Missing auth token' }, { status: 401 })
  }
  const deployToken = authHeader.slice(7)

  const body = await request.json()
  const { repo, sha, status, runId, buildLog } = body

  if (!repo || !status) {
    return Response.json({ error: 'Missing repo or status' }, { status: 400 })
  }

  // Find project by repo and validate deploy token
  const project = await prisma.vcProject.findFirst({
    where: { githubRepo: repo, deployToken },
  })

  if (!project) {
    return Response.json({ error: 'Project not found or invalid token' }, { status: 404 })
  }

  if (status === 'success') {
    // Update latest pending deployment
    const deployment = await prisma.vcDeployment.findFirst({
      where: { projectId: project.id, status: { in: ['pending', 'building'] } },
      orderBy: { createdAt: 'desc' },
    })

    if (deployment) {
      await prisma.vcDeployment.update({
        where: { id: deployment.id },
        data: {
          status: 'live',
          commitSha: sha,
          githubRunId: runId,
          buildLog: buildLog || null,
          completedAt: new Date(),
        },
      })
    }

    // Update project status
    await prisma.vcProject.update({
      where: { id: project.id },
      data: {
        status: 'active',
        lastDeployedAt: new Date(),
      },
    })
  } else if (status === 'failure') {
    const deployment = await prisma.vcDeployment.findFirst({
      where: { projectId: project.id, status: { in: ['pending', 'building'] } },
      orderBy: { createdAt: 'desc' },
    })

    if (deployment) {
      await prisma.vcDeployment.update({
        where: { id: deployment.id },
        data: {
          status: 'failed',
          commitSha: sha,
          githubRunId: runId,
          buildLog: buildLog || null,
          errorType: 'build',
          completedAt: new Date(),
        },
      })
    }

    await prisma.vcProject.update({
      where: { id: project.id },
      data: { status: 'error' },
    })
  }

  return Response.json({ success: true })
}
