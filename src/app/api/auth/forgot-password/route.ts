import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = checkRateLimit(`forgot-password:${ip}`, RATE_LIMITS.login)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Always return success to prevent email enumeration
    return NextResponse.json({ message: 'If an account exists with that email, a reset link has been sent.' })
  }

  const { email } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (user && user.isActive) {
    // Generate token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

    // Create new token
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    // Send email (don't await — fire and forget for consistent response time)
    sendPasswordResetEmail(email, user.name, token)
  }

  // Always return same response (prevents email enumeration)
  return NextResponse.json({ message: 'If an account exists with that email, a reset link has been sent.' })
}
