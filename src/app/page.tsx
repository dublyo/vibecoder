import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentUser, hashPassword, createToken, setAuthCookie } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Check if setup is needed
  const owner = await prisma.user.findFirst({ where: { role: 'owner' } })

  if (!owner) {
    // Auto-setup if env vars are set (provisioned from SaaS portal)
    const ownerEmail = process.env.VIBECODER_OWNER_EMAIL
    const openrouterKey = process.env.OPENROUTER_API_KEY

    if (ownerEmail && openrouterKey) {
      try {
        // Generate a random password — user will set their own later
        const tempPassword = crypto.randomUUID()
        const passwordHash = await hashPassword(tempPassword)

        const user = await prisma.user.create({
          data: {
            email: ownerEmail,
            name: ownerEmail.split('@')[0],
            passwordHash,
            role: 'owner',
            creditsBalance: 10000,
            creditsMonthlyLimit: 100000,
          },
        })

        // Store API key and default settings
        await prisma.settings.createMany({
          data: [
            { key: 'openrouter_api_key', value: openrouterKey },
            { key: 'default_routing_mode', value: 'auto' },
            { key: 'default_credits_monthly', value: '1000' },
            { key: 'setup_completed', value: 'true' },
          ],
        })

        // Auto-login the user so they skip /login too
        const token = await createToken(user.id)
        await setAuthCookie(token)
        redirect('/vibecoder')
      } catch (e) {
        // If auto-setup fails, fall through to manual /setup
        console.error('Auto-setup failed:', e)
        redirect('/setup')
      }
    }

    redirect('/setup')
  }

  // Check if logged in
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  redirect('/vibecoder')
}
