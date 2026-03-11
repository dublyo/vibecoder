import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { deleteRepo } from '@/lib/vibecoder/github'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

// GET /api/vibecoder/projects/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 50 },
      deployments: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  return NextResponse.json({
    project,
    recentMessages: project.messages.reverse(),
    lastDeployment: project.deployments[0] || null,
  })
}

// PATCH /api/vibecoder/projects/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const project = await prisma.vcProject.findFirst({ where: { id, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const updated = await prisma.vcProject.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
    },
  })

  return NextResponse.json({ project: updated })
}

// DELETE /api/vibecoder/projects/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({ where: { id, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Clean up external resources (non-blocking, best-effort)
  const cleanupErrors: string[] = []

  // 1. Delete Portainer stack if exists
  if (project.portainerStackId) {
    try {
      const portainerUrl = process.env.PORTAINER_URL || 'https://portainer:9443'
      const portainerApiKey = process.env.PORTAINER_API_KEY || ''
      const endpointId = process.env.PORTAINER_ENDPOINT_ID || '1'
      if (portainerApiKey) {
        const https = await import('https')
        const agent = new https.Agent({ rejectUnauthorized: false })
        const res = await fetch(
          `${portainerUrl}/api/stacks/${project.portainerStackId}?endpointId=${endpointId}`,
          {
            method: 'DELETE',
            headers: { 'X-API-Key': portainerApiKey },
            // @ts-ignore
            agent,
          },
        )
        if (!res.ok) cleanupErrors.push(`Portainer stack delete: ${res.status}`)
      }
    } catch (err: any) {
      cleanupErrors.push(`Portainer: ${err.message}`)
    }
  }

  // 2. Delete GitHub repo (only for non-imported repos)
  if (!project.importedRepo && project.githubRepo) {
    try {
      const deleted = await deleteRepo(project.githubRepo)
      if (!deleted) cleanupErrors.push('GitHub repo delete failed')
    } catch (err: any) {
      cleanupErrors.push(`GitHub: ${err.message}`)
    }
  }

  // 3. Delete DB records
  await prisma.vcDeployment.deleteMany({ where: { projectId: id } })
  await prisma.vcMessage.deleteMany({ where: { projectId: id } })
  await prisma.vcProject.delete({ where: { id } })

  return NextResponse.json({
    success: true,
    cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
  })
}
