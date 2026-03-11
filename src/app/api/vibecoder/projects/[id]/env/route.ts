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

function parseEnvVars(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

// GET /api/vibecoder/projects/[id]/env — list env vars (values masked)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({
    where: { id, userId: user.id },
    select: { envVars: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const vars = parseEnvVars(project.envVars)

  // Return keys with masked values (show first 4 chars only for non-empty values)
  const masked: Record<string, { value: string; masked: string }> = {}
  for (const [key, value] of Object.entries(vars)) {
    masked[key] = {
      value,
      masked: value.length > 4 ? value.slice(0, 4) + '•'.repeat(Math.min(value.length - 4, 20)) : value,
    }
  }

  return NextResponse.json({ envVars: masked })
}

// PUT /api/vibecoder/projects/[id]/env — set all env vars (full replace)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await prisma.vcProject.findFirst({ where: { id, userId: user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await request.json()
  const { envVars } = body as { envVars: Record<string, string> }

  if (!envVars || typeof envVars !== 'object') {
    return NextResponse.json({ error: 'envVars must be an object of key-value pairs' }, { status: 400 })
  }

  // Validate keys (must be valid env var names)
  for (const key of Object.keys(envVars)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return NextResponse.json({ error: `Invalid env var name: ${key}` }, { status: 400 })
    }
  }

  await prisma.vcProject.update({
    where: { id },
    data: { envVars: JSON.stringify(envVars) },
  })

  return NextResponse.json({ success: true, count: Object.keys(envVars).length })
}
