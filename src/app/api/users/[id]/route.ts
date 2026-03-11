import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { addCredits } from '@/lib/credits'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'member']).optional(),
  creditsMonthlyLimit: z.number().min(0).optional(),
  addCredits: z.number().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireRole(['owner', 'admin'])
    const { id } = await params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const data = parsed.data

    // Only owner can change roles
    if (data.role && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can change roles' }, { status: 403 })
    }

    // Can't modify owner
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (target.role === 'owner' && currentUser.id !== target.id) {
      return NextResponse.json({ error: 'Cannot modify owner' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (data.name) updateData.name = data.name
    if (data.role) updateData.role = data.role
    if (data.creditsMonthlyLimit !== undefined) updateData.creditsMonthlyLimit = data.creditsMonthlyLimit
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    const updated = await prisma.user.update({ where: { id }, data: updateData })

    if (data.addCredits && data.addCredits > 0) {
      await addCredits(id, data.addCredits, 'bonus', `Bonus credits from ${currentUser.name}`)
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        creditsBalance: updated.creditsBalance,
        creditsMonthlyLimit: updated.creditsMonthlyLimit,
        isActive: updated.isActive,
      },
    })
  } catch (err) {
    const msg = (err as Error)?.message
    const safe = ['Unauthorized', 'Forbidden'].includes(msg) ? msg : 'Forbidden'
    return NextResponse.json({ error: safe }, { status: 403 })
  }
}
