import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { sendTestEmail, isEmailConfigured } from '@/lib/email'
import { z } from 'zod'

const schema = z.object({
  to: z.string().email(),
})

// POST: Send a test email (admin only)
export async function POST(req: NextRequest) {
  try {
    await requireRole(['owner', 'admin'])

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'SMTP is not configured. Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASSWORD in your environment.' }, { status: 400 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
    }

    const sent = await sendTestEmail(parsed.data.to)
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email. Check your SMTP configuration and server logs.' }, { status: 500 })
    }

    return NextResponse.json({ message: `Test email sent to ${parsed.data.to}` })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}
