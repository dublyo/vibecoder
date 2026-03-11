import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { seedMcpServers } from '@/lib/mcp-servers-seed'

// GET /api/mcp/servers — list marketplace servers (auto-seeds on first call)
export async function GET() {
  try {
    await requireAuth()
    await seedMcpServers()

    const servers = await prisma.mcpServer.findMany({
      orderBy: [{ isOfficial: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ servers })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[mcp/servers] Error:', msg)
    if (msg === 'Unauthorized' || msg === 'Account disabled') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
