import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireRole, hashPassword } from '@/lib/auth'
import { addCredits } from '@/lib/credits'
import { sendWelcomeInvite } from '@/lib/email'
import { z } from 'zod'

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'member']),
  creditsMonthlyLimit: z.number().min(0).max(1000000).default(1000),
})

// List users (admin/owner only)
export async function GET() {
  try {
    const user = await requireRole(['owner', 'admin'])
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        creditsBalance: true,
        creditsMonthlyLimit: true,
        isActive: true,
        createdAt: true,
        _count: { select: { conversations: true, messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ users, currentUserId: user.id })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}

// Invite user (admin/owner only)
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireRole(['owner', 'admin'])
    const body = await req.json()
    const parsed = inviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { email, name, password, role, creditsMonthlyLimit } = parsed.data

    // Only owner can create admins
    if (role === 'admin' && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can create admins' }, { status: 403 })
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const initialCredits = creditsMonthlyLimit

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        creditsBalance: initialCredits,
        creditsMonthlyLimit,
        invitedById: currentUser.id,
      },
    })

    await addCredits(newUser.id, initialCredits, 'allocation', 'Initial allocation on invite')

    // Send welcome email with credentials (fire and forget)
    sendWelcomeInvite(email, name, password)

    return NextResponse.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    })
  } catch (err) {
    const msg = (err as Error)?.message
    const safe = ['Unauthorized', 'Forbidden'].includes(msg) ? msg : 'Forbidden'
    return NextResponse.json({ error: safe }, { status: 403 })
  }
}
