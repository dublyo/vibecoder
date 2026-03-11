import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Parse SSE or plain JSON response from MCP server */
async function parseMcpResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  // If it's SSE format (event: message\ndata: {...}), extract the JSON from data line
  const dataMatch = text.match(/^data:\s*(.+)$/m)
  if (dataMatch) {
    return JSON.parse(dataMatch[1])
  }
  // Otherwise parse as plain JSON
  return JSON.parse(text)
}

// POST /api/mcp/connect — test connection to an MCP server and cache its tools
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { installationId, url, credentials } = await req.json() as {
      installationId?: string
      url?: string
      credentials?: string
    }

    // Determine the target URL
    let targetUrl: string
    let authHeader: string | undefined

    if (installationId) {
      const inst = await prisma.mcpInstallation.findFirst({
        where: { id: installationId, userId: user.id },
        include: { server: true },
      })
      if (!inst) {
        return NextResponse.json({ error: 'Installation not found' }, { status: 404 })
      }
      targetUrl = inst.server?.url || inst.customUrl || ''
      if (inst.credentials && inst.server?.authConfig) {
        try {
          const config = JSON.parse(inst.server.authConfig)
          authHeader = `${config.keyPrefix || ''}${inst.credentials}`
        } catch { /* skip */ }
      } else if (inst.credentials) {
        authHeader = `Bearer ${inst.credentials}`
      }
    } else if (url) {
      targetUrl = url
      if (credentials) {
        authHeader = `Bearer ${credentials}`
      }
    } else {
      return NextResponse.json({ error: 'installationId or url is required' }, { status: 400 })
    }

    if (!targetUrl) {
      return NextResponse.json({ error: 'No URL configured for this server' }, { status: 400 })
    }

    // Try connecting via MCP Streamable HTTP protocol
    // Send initialize request first, then tools/list
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (authHeader) {
      headers['Authorization'] = authHeader
    }

    // Initialize
    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vibecoder', version: '1.0.0' },
      },
    }

    const initRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(initBody),
      signal: AbortSignal.timeout(10000),
    })

    if (!initRes.ok) {
      return NextResponse.json({
        error: `Server returned ${initRes.status}: ${initRes.statusText}`,
        connected: false,
      }, { status: 502 })
    }

    // Extract session ID if provided
    const sessionId = initRes.headers.get('mcp-session-id')
    // Consume the init response body to avoid connection issues
    await initRes.text().catch(() => {})
    if (sessionId) {
      headers['mcp-session-id'] = sessionId
    }

    // Send initialized notification
    await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {}) // notification, no response expected

    // List tools
    const toolsBody = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }

    const toolsRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(toolsBody),
      signal: AbortSignal.timeout(10000),
    })

    if (!toolsRes.ok) {
      return NextResponse.json({
        error: 'Connected but failed to list tools',
        connected: true,
        tools: [],
      })
    }

    const toolsData = await parseMcpResponse(toolsRes) as { result?: { tools?: Array<{ name: string; description?: string }> } }
    const tools = toolsData.result?.tools || []

    // Cache tools in the installation record
    if (installationId) {
      await prisma.mcpInstallation.update({
        where: { id: installationId },
        data: {
          cachedTools: JSON.stringify(tools),
          toolsCachedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      connected: true,
      tools: tools.map((t: { name: string; description?: string }) => ({
        name: t.name,
        description: t.description || '',
      })),
      toolCount: tools.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return NextResponse.json({ error: message, connected: false }, { status: 502 })
  }
}
