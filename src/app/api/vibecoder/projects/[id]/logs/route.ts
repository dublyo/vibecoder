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

function cleanDockerLogs(raw: string): string {
  // Docker stream protocol: first 8 bytes of each frame are header
  // Remove control characters and stream headers
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

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
    const tail = searchParams.get('tail') || '200'
    const since = searchParams.get('since') || ''

    // Find the app container by user slug
    const userSlug = USER_SLUG
    const containerName = `${userSlug}-app`

    // List containers to find the app container ID
    const containersRes = await portainerFetch(
      `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json?all=true`
    )

    if (!containersRes.ok) {
      return NextResponse.json(
        { error: 'Failed to list containers' },
        { status: 500 }
      )
    }

    const containers = await containersRes.json()
    const appContainer = containers.find((c: any) =>
      c.Names?.some((name: string) => name === `/${containerName}` || name === containerName)
    )

    if (!appContainer) {
      return NextResponse.json(
        { error: `App container "${containerName}" not found` },
        { status: 404 }
      )
    }

    const containerId = appContainer.Id

    // Fetch logs from the container
    let logsUrl = `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`
    if (since) {
      logsUrl += `&since=${since}`
    }

    const logsRes = await portainerFetch(logsUrl)

    if (!logsRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch container logs' },
        { status: 500 }
      )
    }

    const rawLogs = await logsRes.text()
    const logs = cleanDockerLogs(rawLogs)

    return NextResponse.json({
      logs,
      containerId,
      containerName,
      tail: parseInt(tail),
    })
  } catch (error: any) {
    console.error('Logs API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
