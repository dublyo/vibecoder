import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { z } from 'zod'

const projectSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().default('📁'),
})

export async function GET() {
  try {
    const user = await requireAuth()
    const projects = await prisma.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { conversations: true } } },
    })
    return NextResponse.json({ projects })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const parsed = projectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        emoji: parsed.data.emoji,
        ownerId: user.id,
      },
    })

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
