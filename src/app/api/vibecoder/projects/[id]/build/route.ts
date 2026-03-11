import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'

async function getUser() {
  const token = await getAuthCookie()
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return prisma.user.findUnique({ where: { id: payload.userId } })
}

const PORTAINER_URL = process.env.PORTAINER_URL || 'https://portainer:9443'
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY || ''
const PORTAINER_ENDPOINT_ID = process.env.PORTAINER_ENDPOINT_ID || '1'
const BUILD_ENV_CONTAINER = process.env.BUILD_ENV_CONTAINER || 'vc-build-env'

async function portainerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const https = await import('https')
  const agent = new https.Agent({ rejectUnauthorized: false })
  return fetch(`${PORTAINER_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': PORTAINER_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // @ts-ignore
    agent,
  })
}

async function findBuildEnvContainer(): Promise<string | null> {
  const res = await portainerFetch(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json`)
  if (!res.ok) return null
  const containers = await res.json() as any[]
  const container = containers.find((c: any) =>
    c.Names?.some((n: string) => n.includes(BUILD_ENV_CONTAINER))
  )
  return container?.Id || null
}

async function execInContainer(containerId: string, cmd: string[], workDir?: string): Promise<{ output: string; exitCode: number }> {
  const execBody: any = {
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  }
  if (workDir) execBody.WorkingDir = workDir

  const createRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/exec`,
    { method: 'POST', body: JSON.stringify(execBody) }
  )
  if (!createRes.ok) throw new Error(`Failed to create exec: ${await createRes.text()}`)
  const { Id: execId } = await createRes.json() as any

  const startRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/exec/${execId}/start`,
    { method: 'POST', body: JSON.stringify({ Detach: false, Tty: false }) }
  )
  if (!startRes.ok) throw new Error(`Failed to start exec: ${await startRes.text()}`)

  const output = await startRes.text()
  // Clean control characters from Docker stream
  const cleaned = output.replace(/[\x00-\x08\x0e-\x1f]/g, '').trim()

  // Get exit code
  const inspectRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/exec/${execId}/json`
  )
  const inspectData = inspectRes.ok ? await inspectRes.json() as any : {}
  const exitCode = inspectData.ExitCode ?? 0

  return { output: cleaned, exitCode }
}

// Allowed commands for security
// Pin prisma to v6 — v7 has breaking changes (no datasource url in schema)
const ALLOWED_COMMANDS: Record<string, string[]> = {
  'prisma-generate': ['npx', 'prisma@6', 'generate'],
  'prisma-push': ['npx', 'prisma@6', 'db', 'push', '--accept-data-loss'],
  'prisma-migrate': ['npx', 'prisma@6', 'migrate', 'deploy'],
  'npm-install': ['npm', 'install'],
  'pnpm-install': ['pnpm', 'install'],
  'npm-build': ['npm', 'run', 'build'],
  'check-deps': ['npm', 'ls', '--depth=0'],
  'npm-init': ['npm', 'init', '-y'],
}

// POST /api/vibecoder/projects/[id]/build — run build command in build-env container
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({ where: { id, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await request.json()
  const { command } = body as { command: string }

  if (!command || !ALLOWED_COMMANDS[command]) {
    return NextResponse.json({
      error: `Invalid command. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(', ')}`,
    }, { status: 400 })
  }

  const containerId = await findBuildEnvContainer()
  if (!containerId) {
    return NextResponse.json({ error: 'Build environment container not found' }, { status: 503 })
  }

  const githubPat = process.env.GITHUB_PAT || ''
  const workDir = `/tmp/builds/${project.slug}`

  try {
    // Clone or pull the repo
    const cloneUrl = `https://x-access-token:${githubPat}@github.com/${project.githubRepo}.git`
    const { exitCode: checkCode } = await execInContainer(containerId,
      ['test', '-d', `${workDir}/.git`]
    )

    if (checkCode !== 0) {
      // Clone fresh
      await execInContainer(containerId, ['mkdir', '-p', `/tmp/builds`])
      const { output: cloneOut, exitCode: cloneCode } = await execInContainer(containerId,
        ['env', 'GIT_SSL_NO_VERIFY=1', 'git', 'clone', '--depth', '1', cloneUrl, workDir]
      )
      if (cloneCode !== 0) {
        return NextResponse.json({ error: `Git clone failed: ${cloneOut}`, exitCode: cloneCode }, { status: 500 })
      }
    } else {
      // Pull latest
      await execInContainer(containerId, ['env', 'GIT_SSL_NO_VERIFY=1', 'git', 'pull', '--ff-only'], workDir)
    }

    // Set env vars for the command (DATABASE_URL etc.)
    let envPrefix: string[] = []
    if (project.envVars) {
      try {
        const envVars = JSON.parse(project.envVars) as Record<string, string>
        for (const [key, value] of Object.entries(envVars)) {
          envPrefix.push(`${key}=${value}`)
        }
      } catch {}
    }

    // Run the command
    const cmd = ALLOWED_COMMANDS[command]
    const fullCmd = envPrefix.length > 0
      ? ['env', ...envPrefix, ...cmd]
      : cmd

    const { output, exitCode } = await execInContainer(containerId, fullCmd, workDir)

    return NextResponse.json({
      success: exitCode === 0,
      command,
      output,
      exitCode,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/vibecoder/projects/[id]/build — list available commands
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    commands: Object.keys(ALLOWED_COMMANDS).map(cmd => ({
      id: cmd,
      args: ALLOWED_COMMANDS[cmd].join(' '),
    })),
  })
}
