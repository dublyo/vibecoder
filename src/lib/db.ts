import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** Check if a user owns or has shared access to a conversation */
export async function canAccessConversation(conversationId: string, userId: string): Promise<boolean> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId },
    select: { userId: true },
  })
  if (!conv) return false
  if (conv.userId === userId) return true
  const shared = await prisma.sharedConversation.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  return !!shared
}

/** Build a Prisma where clause that matches conversations the user owns OR has shared access to */
export function conversationAccessWhere(conversationId: string, userId: string) {
  return {
    id: conversationId,
    OR: [
      { userId },
      { sharedWith: { some: { userId } } },
    ],
  }
}
