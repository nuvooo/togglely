import { findUserByEmail } from './users'

describe('findUserByEmail', () => {
  it('returns the exact (normalized) match without a fallback query', async () => {
    const user = { id: 'u1', email: 'ada@example.com' }
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        findFirst: jest.fn(),
      },
    }
    await expect(findUserByEmail(prisma, ' Ada@Example.com ')).resolves.toBe(
      user
    )
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ada@example.com' },
    })
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to a case-insensitive match for legacy mixed-case users', async () => {
    const legacy = { id: 'u1', email: 'Ada@Example.com' }
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(legacy),
      },
    }
    await expect(findUserByEmail(prisma, 'ada@example.com')).resolves.toBe(
      legacy
    )
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'ada@example.com', mode: 'insensitive' } },
    })
  })

  it('returns null when nothing matches', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    await expect(findUserByEmail(prisma, 'x@example.com')).resolves.toBeNull()
  })
})
