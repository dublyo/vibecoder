import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/mcp/tools — aggregate tools from user's active servers
export async function GET() {
  try {
    const user = await requireAuth()

    const installations = await prisma.mcpInstallation.findMany({
      where: { userId: user.id, isActive: true },
      include: { server: true },
    })

    const allTools: {
      server: string
      serverSlug: string
      serverIcon: string
      name: string
      description: string
      inputSchema: unknown
    }[] = []

    for (const inst of installations) {
      const serverName = inst.server?.name || inst.customName || 'Custom'
      const serverSlug = inst.server?.slug || inst.id
      const serverIcon = inst.server?.icon || 'terminal'

      if (inst.cachedTools) {
        try {
          const tools = JSON.parse(inst.cachedTools) as { name: string; description: string; inputSchema: unknown }[]
          for (const t of tools) {
            allTools.push({
              server: serverName,
              serverSlug,
              serverIcon,
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema,
            })
          }
        } catch { /* skip unparseable */ }
      }
    }

    return NextResponse.json({ tools: allTools, serverCount: installations.length })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
