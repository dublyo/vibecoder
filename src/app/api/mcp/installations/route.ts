import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/mcp/installations — list user's installed servers
export async function GET() {
  try {
    const user = await requireAuth()

    const installations = await prisma.mcpInstallation.findMany({
      where: { userId: user.id },
      include: { server: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ installations })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// POST /api/mcp/installations — install a server (official or custom)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { serverId, customUrl, customName, credentials } = body as {
      serverId?: string
      customUrl?: string
      customName?: string
      credentials?: string
    }

    if (!serverId && !customUrl) {
      return NextResponse.json({ error: 'serverId or customUrl is required' }, { status: 400 })
    }

    // Check if already installed (for official servers)
    if (serverId) {
      const existing = await prisma.mcpInstallation.findUnique({
        where: { userId_serverId: { userId: user.id, serverId } },
      })
      if (existing) {
        return NextResponse.json({ error: 'Server already installed' }, { status: 409 })
      }
    }

    const installation = await prisma.mcpInstallation.create({
      data: {
        userId: user.id,
        serverId: serverId || null,
        customUrl: customUrl || null,
        customName: customName || null,
        credentials: credentials || null,
      },
      include: { server: true },
    })

    return NextResponse.json({ installation })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PATCH /api/mcp/installations — update an installation
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { id, isActive, budgetLimit, credentials } = body as {
      id: string
      isActive?: boolean
      budgetLimit?: number
      credentials?: string
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const result = await prisma.mcpInstallation.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(budgetLimit !== undefined ? { budgetLimit } : {}),
        ...(credentials !== undefined ? { credentials } : {}),
      },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// DELETE /api/mcp/installations — uninstall a server
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const result = await prisma.mcpInstallation.deleteMany({
      where: { id, userId: user.id },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
