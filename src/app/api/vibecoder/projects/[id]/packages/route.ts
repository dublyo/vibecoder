import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'

const PORTAINER_URL = process.env.PORTAINER_URL || 'https://portainer:9443'
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY || ''
const PORTAINER_ENDPOINT_ID = process.env.PORTAINER_ENDPOINT_ID || '1'
const USER_SLUG = process.env.USER_SLUG || ''

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

async function portainerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const https = await import('https')
  const agent = new https.Agent({ rejectUnauthorized: false })
  return fetch(`${PORTAINER_URL}${path}`, {
    ...options,
    headers: { 'X-API-Key': PORTAINER_API_KEY, 'Content-Type': 'application/json', ...options.headers },
    // @ts-ignore
    agent,
  })
}

async function execInContainer(containerId: string, cmd: string[], workDir?: string): Promise<string> {
  const execBody: any = {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: cmd,
  }
  if (workDir) {
    execBody.WorkingDir = workDir
  }

  // Create exec instance
  const createRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/exec`,
    {
      method: 'POST',
      body: JSON.stringify(execBody),
    }
  )

  if (!createRes.ok) {
    throw new Error(`Failed to create exec: ${await createRes.text()}`)
  }

  const { Id: execId } = await createRes.json()

  // Start exec
  const startRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/exec/${execId}/start`,
    {
      method: 'POST',
      body: JSON.stringify({ Detach: false, Tty: true }),
    }
  )

  if (!startRes.ok) {
    throw new Error(`Failed to start exec: ${await startRes.text()}`)
  }

  const output = await startRes.text()
  return output.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()
}

async function findBuildEnvContainer(): Promise<string> {
  const containerName = `${USER_SLUG}-build-env`
  const containersRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json?all=true`
  )

  if (!containersRes.ok) {
    throw new Error('Failed to list containers')
  }

  const containers = await containersRes.json()
  const buildContainer = containers.find((c: any) =>
    c.Names?.some((name: string) => name === `/${containerName}` || name === containerName)
  )

  if (!buildContainer) {
    throw new Error(`Build-env container "${containerName}" not found`)
  }

  return buildContainer.Id
}

// GET: Search npm registry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const project = await prisma.vcProject.findFirst({
      where: { id, userId: user.id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')

    if (!q) {
      return NextResponse.json({ error: 'Search query (q) is required' }, { status: 400 })
    }

    const npmRes = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=10`
    )

    if (!npmRes.ok) {
      return NextResponse.json(
        { error: 'Failed to search npm registry' },
        { status: 502 }
      )
    }

    const npmData = await npmRes.json()

    const packages = npmData.objects.map((obj: any) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description || '',
      keywords: obj.package.keywords || [],
      publisher: obj.package.publisher?.username || '',
      date: obj.package.date,
      links: {
        npm: obj.package.links?.npm || '',
        homepage: obj.package.links?.homepage || '',
        repository: obj.package.links?.repository || '',
      },
      score: obj.score?.final || 0,
    }))

    return NextResponse.json({ packages, query: q })
  } catch (error: any) {
    console.error('Packages GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Install an npm package in the build-env container
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const project = await prisma.vcProject.findFirst({
      where: { id, userId: user.id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, dev } = body as { name: string; dev?: boolean }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Package name is required' }, { status: 400 })
    }

    // Validate package name (prevent shell injection)
    const validPackageName = /^(@[\w\-\.]+\/)?[\w\-\.]+(@[\w\-\.^~>=<]+)?$/
    if (!validPackageName.test(name)) {
      return NextResponse.json(
        { error: 'Invalid package name format' },
        { status: 400 }
      )
    }

    const containerId = await findBuildEnvContainer()

    // Project workdir in build-env is /workspace/{slug}
    const workDir = `/workspace/${project.slug}`

    const installCmd = dev
      ? ['npm', 'install', '-D', name]
      : ['npm', 'install', name]

    const output = await execInContainer(containerId, installCmd, workDir)

    return NextResponse.json({
      success: true,
      output,
      package: name,
      dev: !!dev,
      projectSlug: project.slug,
    })
  } catch (error: any) {
    console.error('Packages POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
