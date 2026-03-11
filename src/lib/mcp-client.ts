import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prisma } from './db'

export interface McpToolDef {
  serverSlug: string
  serverName: string
  serverIcon: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface ConnectedServer {
  slug: string
  name: string
  icon: string
  client: Client
  tools: McpToolDef[]
}

/**
 * Connect to a user's active MCP installations, discover tools, and return
 * a map of serverSlug -> ConnectedServer.
 */
export async function connectUserMcpServers(userId: string): Promise<Map<string, ConnectedServer>> {
  const installations = await prisma.mcpInstallation.findMany({
    where: { userId, isActive: true },
    include: { server: true },
  })

  const servers = new Map<string, ConnectedServer>()

  await Promise.all(
    installations.map(async (inst) => {
      const url = inst.server?.url || inst.customUrl
      const slug = inst.server?.slug || inst.customName?.toLowerCase().replace(/\s+/g, '-') || inst.id
      const name = inst.server?.name || inst.customName || 'Custom'
      const icon = inst.server?.icon || 'terminal'

      if (!url) return

      try {
        const headers: Record<string, string> = {}
        if (inst.credentials && inst.server?.authConfig) {
          const authConfig = JSON.parse(inst.server.authConfig)
          headers[authConfig.keyHeader || 'Authorization'] =
            (authConfig.keyPrefix || '') + inst.credentials
        }

        const transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers },
        })

        const client = new Client({
          name: 'vibecoder',
          version: '1.0.0',
        })

        await client.connect(transport)

        const toolsResponse = await client.listTools()
        const tools: McpToolDef[] = (toolsResponse.tools || []).map((t) => ({
          serverSlug: slug,
          serverName: name,
          serverIcon: icon,
          name: t.name,
          description: t.description || '',
          inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
        }))

        servers.set(slug, { slug, name, icon, client, tools })
      } catch (err) {
        console.error(`[mcp] Failed to connect to ${name} (${url}):`, (err as Error).message)
      }
    })
  )

  return servers
}

/**
 * Convert MCP tools to OpenAI-compatible function tool definitions
 * with namespaced names (serverSlug__toolName).
 */
export function mcpToolsToOpenAI(servers: Map<string, ConnectedServer>) {
  const tools: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }> = []

  for (const [, server] of servers) {
    for (const tool of server.tools) {
      tools.push({
        type: 'function',
        function: {
          name: `${server.slug}__${tool.name}`,
          description: `[${server.name}] ${tool.description}`,
          parameters: tool.inputSchema,
        },
      })
    }
  }

  return tools
}

/**
 * Execute a tool call on the correct MCP server.
 * Returns the result content as a string.
 */
export async function executeMcpToolCall(
  servers: Map<string, ConnectedServer>,
  namespacedName: string,
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  const separatorIndex = namespacedName.indexOf('__')
  if (separatorIndex === -1) {
    return { result: `Invalid tool name: ${namespacedName}`, isError: true }
  }

  const serverSlug = namespacedName.slice(0, separatorIndex)
  const toolName = namespacedName.slice(separatorIndex + 2)
  const server = servers.get(serverSlug)

  if (!server) {
    return { result: `Server not found: ${serverSlug}`, isError: true }
  }

  try {
    const response = await server.client.callTool({ name: toolName, arguments: args })

    const content = Array.isArray(response.content)
      ? response.content
          .map((c) => {
            if (typeof c === 'string') return c
            if (c.type === 'text') return c.text
            if (c.type === 'resource') return JSON.stringify(c.resource)
            return JSON.stringify(c)
          })
          .join('\n')
      : String(response.content)

    return { result: content, isError: !!response.isError }
  } catch (err) {
    return { result: `Tool error: ${(err as Error).message}`, isError: true }
  }
}

/**
 * Disconnect all MCP clients cleanly.
 */
export async function disconnectAll(servers: Map<string, ConnectedServer>) {
  for (const [, server] of servers) {
    try {
      await server.client.close()
    } catch {
      // ignore close errors
    }
  }
}
