import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getAuthCookie } from '@/lib/auth'
import crypto from 'crypto'

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

async function execInPostgres(sql: string): Promise<string> {
  // Find postgres container
  const listRes = await portainerFetch(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json`)
  if (!listRes.ok) throw new Error('Failed to list containers')
  const containers = await listRes.json() as any[]
  const pgContainer = containers.find((c: any) =>
    c.Names?.some((n: string) => n.includes('postgres'))
  )
  if (!pgContainer) throw new Error('PostgreSQL container not found')

  const createRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${pgContainer.Id}/exec`,
    {
      method: 'POST',
      body: JSON.stringify({
        Cmd: ['psql', '-U', 'vibecoder', '-d', 'app', '-t', '-c', sql],
        AttachStdout: true,
        AttachStderr: true,
      }),
    }
  )
  if (!createRes.ok) throw new Error('Failed to create exec')
  const { Id: execId } = await createRes.json() as any

  const startRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/exec/${execId}/start`,
    { method: 'POST', body: JSON.stringify({ Detach: false, Tty: false }) }
  )
  if (!startRes.ok) throw new Error('Failed to exec SQL')
  return (await startRes.text()).replace(/[\x00-\x08\x0e-\x1f]/g, '').trim()
}

// POST /api/vibecoder/projects/[id]/database — provision a database for this project
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({ where: { id, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Check if DATABASE_URL is already set
  const existingVars = project.envVars ? JSON.parse(project.envVars) as Record<string, string> : {}
  if (existingVars.DATABASE_URL) {
    return NextResponse.json({
      message: 'Database already provisioned',
      databaseUrl: existingVars.DATABASE_URL,
    })
  }

  // Create a dedicated database for this project
  const dbName = `vc_${project.slug.replace(/-/g, '_')}`
  const dbPassword = crypto.randomBytes(16).toString('hex')
  const dbUser = `vc_${project.slug.replace(/-/g, '_').slice(0, 20)}`

  try {
    // Create user and database
    await execInPostgres(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPassword}' CREATEDB;`)
    await execInPostgres(`CREATE DATABASE "${dbName}" OWNER "${dbUser}";`)
    await execInPostgres(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}";`)

    // Build the DATABASE_URL (uses internal Docker network hostname)
    const userSlug = process.env.USER_SLUG || 'dev'
    const pgHost = `${userSlug}-postgres`
    const databaseUrl = `postgresql://${dbUser}:${dbPassword}@${pgHost}:5432/${dbName}`

    // Save to project env vars
    existingVars.DATABASE_URL = databaseUrl
    await prisma.vcProject.update({
      where: { id },
      data: { envVars: JSON.stringify(existingVars) },
    })

    return NextResponse.json({
      success: true,
      database: dbName,
      databaseUrl,
      message: 'Database provisioned. Run "Prisma Push" in the Build tab to create tables.',
    })
  } catch (err: any) {
    // If user/db already exists, just build the URL
    if (err.message?.includes('already exists')) {
      const userSlug = process.env.USER_SLUG || 'dev'
      const pgHost = `${userSlug}-postgres`
      const databaseUrl = `postgresql://${dbUser}:${dbPassword}@${pgHost}:5432/${dbName}`
      existingVars.DATABASE_URL = databaseUrl
      await prisma.vcProject.update({
        where: { id },
        data: { envVars: JSON.stringify(existingVars) },
      })
      return NextResponse.json({ success: true, database: dbName, databaseUrl })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/vibecoder/projects/[id]/database — check database status
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({
    where: { id, userId: user.id },
    select: { envVars: true, slug: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const vars = project.envVars ? JSON.parse(project.envVars) as Record<string, string> : {}
  const hasDb = !!vars.DATABASE_URL

  if (!hasDb) {
    return NextResponse.json({ provisioned: false })
  }

  // Check if database is accessible
  try {
    const dbName = `vc_${project.slug.replace(/-/g, '_')}`
    const result = await execInPostgres(
      `SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename != '' AND tableowner LIKE 'vc_%';`
    )
    return NextResponse.json({
      provisioned: true,
      database: dbName,
      tableCount: parseInt(result) || 0,
    })
  } catch {
    return NextResponse.json({ provisioned: true, database: vars.DATABASE_URL?.split('/').pop() })
  }
}
