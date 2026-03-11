import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import { createRepo, scaffoldProjectRepo } from '@/lib/vibecoder/github'
import crypto from 'crypto'

async function getUser(request: NextRequest) {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

// GET /api/vibecoder/projects — list user's projects
export async function GET(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projects = await prisma.vcProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { messages: true, deployments: true } },
    },
  })

  return NextResponse.json({ projects })
}

// POST /api/vibecoder/projects — create a new project
export async function POST(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, framework, template, description, importRepo } = body

  if (!name || !framework) {
    return NextResponse.json({ error: 'Name and framework are required' }, { status: 400 })
  }

  // Generate slug
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const suffix = crypto.randomBytes(3).toString('hex')
  const slug = `${baseSlug}-${suffix}`

  // Get user's server slug from env
  const userSlug = process.env.USER_SLUG || 'dev'
  const subdomain = `${baseSlug}.${userSlug}.dublyo.co`
  const repoName = `vc-${baseSlug}-${suffix}`
  const deployToken = crypto.randomBytes(16).toString('hex')

  // Determine next available port
  const existingPorts = await prisma.vcProject.findMany({
    where: { userId: user.id },
    select: { port: true },
    orderBy: { port: 'desc' },
  })
  const nextPort = existingPorts.length > 0 ? (existingPorts[0].port || 3000) + 1 : 3001

  let githubRepo = ''

  try {
    if (importRepo) {
      // Import existing repo — for now just reference it
      githubRepo = importRepo
    } else {
      // Create new repo
      const templateName = template ? `vc-template-${framework}` : undefined
      if (templateName) {
        // Try template, fallback to empty repo
        try {
          const { fullName } = await (await import('@/lib/vibecoder/github')).createRepoFromTemplate(
            templateName, repoName, description || `VibeCoder project: ${name}`,
          )
          githubRepo = fullName
        } catch {
          const { fullName } = await createRepo(repoName, description || `VibeCoder project: ${name}`)
          githubRepo = fullName
        }
      } else {
        const { fullName } = await createRepo(repoName, description || `VibeCoder project: ${name}`)
        githubRepo = fullName
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to create GitHub repo: ${err.message}` }, { status: 500 })
  }

  const project = await prisma.vcProject.create({
    data: {
      userId: user.id,
      name,
      slug,
      description,
      framework,
      template,
      githubRepo,
      importedRepo: !!importRepo,
      subdomain,
      port: nextPort,
      deployToken,
      status: 'creating',
    },
  })

  // Start async setup (DNS, container, etc.) — non-blocking
  setupProject(project.id).catch(err => {
    console.error(`Project setup failed for ${project.id}:`, err)
    prisma.vcProject.update({
      where: { id: project.id },
      data: { status: 'error' },
    }).catch(() => {})
  })

  return NextResponse.json({ project }, { status: 201 })
}

/** Call Portainer API (handles self-signed cert) */
async function portainerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const portainerUrl = process.env.PORTAINER_URL || 'https://portainer:9443'
  const portainerApiKey = process.env.PORTAINER_API_KEY || ''

  // Use Node's https agent to skip TLS verification for self-signed certs
  const https = await import('https')
  const agent = new https.Agent({ rejectUnauthorized: false })

  return fetch(`${portainerUrl}${path}`, {
    ...options,
    headers: {
      'X-API-Key': portainerApiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // @ts-ignore — Node.js fetch supports agent
    agent,
  })
}

/** Async project setup: scaffold repo files + create Docker container via Portainer API */
async function setupProject(projectId: string) {
  const project = await prisma.vcProject.findUnique({ where: { id: projectId } })
  if (!project) return

  // Scaffold the repo with Dockerfile, GitHub Actions workflow, and starter files
  if (!project.importedRepo && project.githubRepo) {
    try {
      console.log(`Scaffolding repo ${project.githubRepo} for ${project.framework}...`)
      await scaffoldProjectRepo(project.githubRepo, project.framework, project.name)
      console.log(`Scaffold complete for ${project.githubRepo}`)
    } catch (err: any) {
      console.error(`Scaffold failed for ${project.githubRepo}: ${err.message}`)
      // Non-fatal — project can still work, user can add files via AI chat
    }
  }

  const portainerApiKey = process.env.PORTAINER_API_KEY || ''
  const endpointId = process.env.PORTAINER_ENDPOINT_ID || '1'

  if (!portainerApiKey) {
    console.error('PORTAINER_API_KEY not set, skipping container creation')
    await prisma.vcProject.update({ where: { id: projectId }, data: { status: 'active' } })
    return
  }

  // Subdomain uses wildcard DNS: {project}.{userSlug}.dublyo.co
  // The wildcard *.{userSlug}.dublyo.co already resolves via Cloudflare
  // Just need Traefik Host rule to route traffic to the container
  const containerName = `vc-${project.slug}`

  try {
    const githubPat = process.env.GITHUB_PAT || ''

    // Load user-defined env vars from DB
    let userEnvLines = ''
    if (project.envVars) {
      try {
        const envVars = JSON.parse(project.envVars) as Record<string, string>
        for (const [key, value] of Object.entries(envVars)) {
          userEnvLines += `      - ${key}=${value}\n`
        }
      } catch {}
    }

    const compose = `version: "3.8"
services:
  app:
    image: ghcr.io/${project.githubRepo}:latest
    container_name: ${containerName}
    restart: unless-stopped
    environment:
      - GITHUB_PAT=${githubPat}
      - NODE_TLS_REJECT_UNAUTHORIZED=0
${userEnvLines}    networks:
      - dublyo-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${containerName}.rule=Host(\\x60${project.subdomain}\\x60)"
      - "traefik.http.routers.${containerName}.entrypoints=websecure"
      - "traefik.http.routers.${containerName}.tls=true"
      - "traefik.http.services.${containerName}.loadbalancer.server.port=${project.port || 3000}"
networks:
  dublyo-public:
    external: true
`

    const stackRes = await portainerFetch(
      `/api/stacks/create/standalone/string?endpointId=${endpointId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: containerName,
          stackFileContent: compose,
          env: [],
        }),
      },
    )

    if (!stackRes.ok) {
      const errText = await stackRes.text()
      console.error(`Portainer stack creation failed: ${stackRes.status} ${errText}`)
      // Stack may fail if GHCR image doesn't exist yet — will be created on first deploy
    } else {
      const stackData = await stackRes.json() as any
      await prisma.vcProject.update({
        where: { id: projectId },
        data: { portainerStackId: stackData.Id, containerName },
      })
    }
  } catch (err: any) {
    console.error(`Container setup error: ${err.message}`)
  }

  // Mark as active — container will be fully live after first GitHub Actions build
  await prisma.vcProject.update({
    where: { id: projectId },
    data: { status: 'active', containerName },
  })
}
