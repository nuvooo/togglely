import { Prisma, PrismaClient, User } from '@prisma/client'
import { normalizeEmail } from './validation/normalize-email'

type UserLookupClient = Pick<PrismaClient, 'user'> | Prisma.TransactionClient

/**
 * Finds a user by email. New addresses are stored normalized (trimmed,
 * lowercased), so the exact lookup hits the unique index; accounts created
 * before normalization may still have mixed-case addresses and are found by
 * a case-insensitive fallback.
 */
export async function findUserByEmail(
  prisma: UserLookupClient,
  email: string
): Promise<User | null> {
  const normalized = normalizeEmail(email)
  return (
    (await prisma.user.findUnique({ where: { email: normalized } })) ??
    (await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    }))
  )
}
