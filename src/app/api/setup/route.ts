import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword, createToken, setAuthCookie } from '@/lib/auth'
import { validateApiKey } from '@/lib/openrouter'
import { addCredits } from '@/lib/credits'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { z } from 'zod'

const setupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  openrouterApiKey: z.string().min(10).max(500),
})

// Check if setup is needed
export async function GET() {
  const owner = await prisma.user.findFirst({ where: { role: 'owner' } })
  return NextResponse.json({
    needsSetup: !owner,
    ownerEmail: process.env.VIBECODER_OWNER_EMAIL || '',
  })
}

// Perform initial setup
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = checkRateLimit(`setup:${ip}`, RATE_LIMITS.setup)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  // Check if already set up
  const existingOwner = await prisma.user.findFirst({ where: { role: 'owner' } })
  if (existingOwner) {
    return NextResponse.json({ error: 'Setup already completed' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { email, name, password, openrouterApiKey } = parsed.data

  // Validate OpenRouter API key
  const isValid = await validateApiKey(openrouterApiKey)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid OpenRouter API key' }, { status: 400 })
  }

  // Create owner user
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'owner',
      creditsBalance: 10000, // 10K credits to start
      creditsMonthlyLimit: 100000,
    },
  })

  // Store API key in settings
  await prisma.settings.create({
    data: { key: 'openrouter_api_key', value: openrouterApiKey },
  })

  // Store default settings
  await prisma.settings.createMany({
    data: [
      { key: 'default_routing_mode', value: 'auto' },
      { key: 'default_credits_monthly', value: '1000' },
      { key: 'setup_completed', value: 'true' },
    ],
  })

  // Record initial credit allocation
  await addCredits(user.id, 10000, 'allocation', 'Initial setup allocation')

  // Create auth token
  const token = await createToken(user.id)
  await setAuthCookie(token)

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
}
