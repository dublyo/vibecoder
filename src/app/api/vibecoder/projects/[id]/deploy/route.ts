import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { triggerWorkflow } from '@/lib/vibecoder/github'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

async function portainerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const portainerUrl = process.env.PORTAINER_URL || 'https://portainer:9443'
  const portainerApiKey = process.env.PORTAINER_API_KEY || ''
  const https = await import('https')
  const agent = new https.Agent({ rejectUnauthorized: false })
  return fetch(`${portainerUrl}${path}`, {
    ...options,
    headers: {
      'X-API-Key': portainerApiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // @ts-ignore
    agent,
  })
}

/** Update container env vars by recreating it with new environment */
async function updateContainerEnv(project: any) {
  if (!project.containerName) return

  const endpointId = process.env.PORTAINER_ENDPOINT_ID || '1'

  // Find the current container
  const listRes = await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/json?all=true`)
  if (!listRes.ok) return
  const containers = await listRes.json() as any[]
  const container = containers.find((c: any) =>
    c.Names?.some((n: string) => n.includes(project.containerName))
  )
  if (!container) return

  // Get full container config
  const inspectRes = await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/${container.Id}/json`)
  if (!inspectRes.ok) return
  const config = await inspectRes.json() as any

  // Build new env array from existing + user env vars
  const existingEnv = (config.Config?.Env || []) as string[]
  const systemKeys = new Set(existingEnv.map((e: string) => e.split('=')[0]))

  // Parse user env vars
  let userEnvVars: Record<string, string> = {}
  if (project.envVars) {
    try { userEnvVars = JSON.parse(project.envVars) } catch {}
  }

  // Merge: keep system vars, add/override user vars
  const newEnv = existingEnv.filter((e: string) => {
    const key = e.split('=')[0]
    return !userEnvVars[key] // remove existing user vars (will re-add)
  })
  for (const [key, value] of Object.entries(userEnvVars)) {
    newEnv.push(`${key}=${value}`)
  }

  // Stop old container
  await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/${container.Id}/stop`, { method: 'POST' })

  // Remove old container
  await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/${container.Id}`, { method: 'DELETE' })

  // Create new container with updated env
  const createRes = await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/create?name=${project.containerName}`, {
    method: 'POST',
    body: JSON.stringify({
      ...config.Config,
      Env: newEnv,
      HostConfig: config.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: config.NetworkSettings?.Networks || {},
      },
    }),
  })

  if (createRes.ok) {
    const newContainer = await createRes.json() as any
    await portainerFetch(`/api/endpoints/${endpointId}/docker/containers/${newContainer.Id}/start`, { method: 'POST' })
  }
}

// POST /api/vibecoder/projects/[id]/deploy — manual redeploy
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const project = await prisma.vcProject.findFirst({ where: { id: projectId, userId: user.id } })
  if (!project) return new Response('Project not found', { status: 404 })

  try {
    // Trigger GitHub Actions build workflow
    await triggerWorkflow(project.githubRepo, 'build.yml', project.githubBranch)

    // Update container env vars if they've changed
    if (project.envVars) {
      updateContainerEnv(project).catch(err =>
        console.error(`Failed to update container env for ${projectId}:`, err.message)
      )
    }

    // Create deployment record
    const deployment = await prisma.vcDeployment.create({
      data: {
        projectId,
        status: 'pending',
      },
    })

    // Update project status
    await prisma.vcProject.update({
      where: { id: projectId },
      data: { status: 'building' },
    })

    return Response.json({
      deployment,
      message: `Build triggered for ${project.name}. GitHub Actions will build the Docker image and deploy it to ${project.subdomain || 'your server'}.`,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
