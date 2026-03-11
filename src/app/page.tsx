import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Check if setup is needed
  const owner = await prisma.user.findFirst({ where: { role: 'owner' } })
  if (!owner) redirect('/setup')

  // Check if logged in
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  redirect('/vibecoder')
}
