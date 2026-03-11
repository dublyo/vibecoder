import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// Get skill details (with content)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const skill = await prisma.skill.findFirst({
      where: {
        id,
        OR: [{ userId: user.id }, { isPublic: true }],
      },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    return NextResponse.json({ skill })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Update skill
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    // Only the owner can edit
    const skill = await prisma.skill.findFirst({
      where: { id, userId: user.id },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found or not yours' }, { status: 404 })
    }

    const updated = await prisma.skill.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      },
    })

    return NextResponse.json({ skill: updated })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Delete skill
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const skill = await prisma.skill.findFirst({
      where: { id, userId: user.id },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found or not yours' }, { status: 404 })
    }

    await prisma.skill.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
