import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// List skills
export async function GET() {
  try {
    const user = await requireAuth()
    const skills = await prisma.skill.findMany({
      where: {
        OR: [
          { userId: user.id },
          { isPublic: true },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        category: true,
        source: true,
        isPublic: true,
        usageCount: true,
        createdAt: true,
        userId: true,
      },
    })
    return NextResponse.json({ skills })
  } catch (err) {
    console.error('[skills GET] Error:', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Create skill
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()

    const { name, description, content, icon, category, isPublic } = body

    if (!name || !description || !content) {
      return NextResponse.json({ error: 'Name, description, and content are required' }, { status: 400 })
    }

    // Validate lengths
    if (typeof name !== 'string' || name.length > 100) {
      return NextResponse.json({ error: 'Name must be under 100 characters' }, { status: 400 })
    }
    if (typeof description !== 'string' || description.length > 500) {
      return NextResponse.json({ error: 'Description must be under 500 characters' }, { status: 400 })
    }
    if (typeof content !== 'string' || content.length > 50000) {
      return NextResponse.json({ error: 'Skill content must be under 50000 characters' }, { status: 400 })
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check uniqueness
    const existing = await prisma.skill.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'A skill with this name already exists' }, { status: 409 })
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        slug,
        description,
        content,
        icon: icon || '🔧',
        category: category || null,
        source: 'custom',
        userId: user.id,
        isPublic: isPublic || false,
      },
    })

    return NextResponse.json({ skill })
  } catch (err) {
    console.error('[skills POST] Error:', err)
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 })
  }
}
