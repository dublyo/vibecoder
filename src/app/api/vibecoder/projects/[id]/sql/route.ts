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

async function execInContainer(containerId: string, cmd: string[]): Promise<string> {
  // Create exec instance
  const createRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/exec`,
    {
      method: 'POST',
      body: JSON.stringify({
        AttachStdout: true,
        AttachStderr: true,
        Cmd: cmd,
      }),
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

function parseDatabaseUrl(url: string) {
  // postgresql://user:password@host:port/dbname
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
  if (!match) throw new Error('Invalid DATABASE_URL format')
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5],
  }
}

const WRITE_KEYWORDS = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'UPDATE', 'INSERT', 'CREATE', 'GRANT', 'REVOKE']
const READ_KEYWORDS = ['SELECT', 'SHOW', 'DESCRIBE', '\\DT', '\\D', 'EXPLAIN', 'WITH']

function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  // Check if it starts with a read keyword or is a psql meta-command
  if (normalized.startsWith('\\DT') || normalized.startsWith('\\D')) return true
  for (const keyword of READ_KEYWORDS) {
    if (normalized.startsWith(keyword)) return true
  }
  return false
}

function containsWriteKeyword(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  for (const keyword of WRITE_KEYWORDS) {
    // Match keyword at word boundary
    const regex = new RegExp(`\\b${keyword}\\b`)
    if (regex.test(normalized)) return true
  }
  return false
}

async function findPostgresContainer(): Promise<string> {
  const containerName = `${USER_SLUG}-postgres`
  const containersRes = await portainerFetch(
    `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json?all=true`
  )

  if (!containersRes.ok) {
    throw new Error('Failed to list containers')
  }

  const containers = await containersRes.json()
  const pgContainer = containers.find((c: any) =>
    c.Names?.some((name: string) => name === `/${containerName}` || name === containerName)
  )

  if (!pgContainer) {
    throw new Error(`Postgres container "${containerName}" not found`)
  }

  return pgContainer.Id
}

// GET: List tables in the project database
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

    // Parse DATABASE_URL from envVars
    const envVars = project.envVars ? JSON.parse(project.envVars as string) : {}
    const databaseUrl = envVars.DATABASE_URL

    if (!databaseUrl) {
      return NextResponse.json(
        { error: 'No DATABASE_URL configured for this project' },
        { status: 400 }
      )
    }

    const dbConfig = parseDatabaseUrl(databaseUrl)
    const containerId = await findPostgresContainer()

    const sql = `SELECT table_name, (SELECT count(*) FROM information_schema.columns WHERE table_name=t.table_name AND table_schema='public') as column_count FROM information_schema.tables t WHERE table_schema='public' ORDER BY table_name`

    const output = await execInContainer(containerId, [
      'psql', '-U', dbConfig.user, '-d', dbConfig.database, '-c', sql,
    ])

    return NextResponse.json({ tables: output })
  } catch (error: any) {
    console.error('SQL GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Execute SQL query
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
    const { sql, allowWrite } = body as { sql: string; allowWrite?: boolean }

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 })
    }

    // Security check: block write operations unless explicitly allowed
    if (!allowWrite && containsWriteKeyword(sql)) {
      return NextResponse.json(
        {
          error: 'Write operations (DROP, DELETE, TRUNCATE, ALTER, UPDATE, INSERT, CREATE, GRANT, REVOKE) are not allowed. Pass allowWrite: true to override.',
          blocked: true,
        },
        { status: 403 }
      )
    }

    // Parse DATABASE_URL from envVars
    const envVars = project.envVars ? JSON.parse(project.envVars as string) : {}
    const databaseUrl = envVars.DATABASE_URL

    if (!databaseUrl) {
      return NextResponse.json(
        { error: 'No DATABASE_URL configured for this project' },
        { status: 400 }
      )
    }

    const dbConfig = parseDatabaseUrl(databaseUrl)
    const containerId = await findPostgresContainer()

    // Sanitize SQL to prevent shell injection
    const sanitizedSql = sql.replace(/'/g, "'\\''")

    const output = await execInContainer(containerId, [
      'psql', '-U', dbConfig.user, '-d', dbConfig.database, '-c', sql,
    ])

    // Try to extract row count from psql output (e.g., "(5 rows)")
    const rowCountMatch = output.match(/\((\d+)\s+rows?\)/)
    const rowCount = rowCountMatch ? parseInt(rowCountMatch[1]) : undefined

    return NextResponse.json({
      rows: output,
      rowCount,
      readOnly: !allowWrite,
    })
  } catch (error: any) {
    console.error('SQL POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
