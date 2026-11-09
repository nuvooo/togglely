import { NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { hashToken } from '../../shared/utils'
import { PasswordResetService } from './password-reset.service'

jest.mock('bcryptjs')

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password: 'hashed-password',
  resetToken: null,
  resetTokenExpiry: null,
}

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  } as any

  const mailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  } as any

  const config = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'RESET_TOKEN_EXPIRY_HOURS') return defaultValue ?? 1
      if (key === 'FRONTEND_URL') return 'https://togglely.example.com'
      return defaultValue
    }),
  } as any

  const service = new PasswordResetService(prisma, mailService, config)
  return { service, prisma, mailService, config }
}

describe('PasswordResetService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('requestReset', () => {
    it('creates a reset token and sends email for valid user', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.user.update.mockResolvedValue({})

      await service.requestReset('test@example.com')

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          resetToken: expect.any(String),
          resetTokenExpiry: expect.any(Date),
        }),
      })
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      )
    })

    it('stores only the hash of the emailed token', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.user.update.mockResolvedValue({})

      await service.requestReset('test@example.com')

      const emailedToken = mailService.sendPasswordResetEmail.mock.calls[0][1]
      const stored = prisma.user.update.mock.calls[0][0].data.resetToken
      expect(stored).toBe(hashToken(emailedToken))
      expect(stored).not.toBe(emailedToken)
    })

    it('finds legacy mixed-case accounts and mails their stored address', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        email: 'Test@Example.com',
      })
      prisma.user.update.mockResolvedValue({})

      await service.requestReset('test@example.com')

      expect(prisma.user.update).toHaveBeenCalled()
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'Test@Example.com',
        expect.any(String)
      )
    })

    it('silently returns for unknown email (no information leak)', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(null)

      await service.requestReset('unknown@example.com')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('handles mail service failure gracefully', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.user.update.mockResolvedValue({})
      mailService.sendPasswordResetEmail.mockRejectedValue(
        new Error('SMTP error')
      )

      // Should not throw
      await service.requestReset('test@example.com')

      expect(prisma.user.update).toHaveBeenCalled()
    })

    it('stays generic and logs a warning when SMTP is not configured', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.user.update.mockResolvedValue({})
      mailService.sendPasswordResetEmail.mockResolvedValue(false)
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined)

      await expect(
        service.requestReset('test@example.com')
      ).resolves.toBeUndefined()

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('SMTP is not configured')
      )
    })
  })

  describe('createResetLink', () => {
    it('returns a reset URL with a fresh token and stores only its hash', async () => {
      const { service, prisma, mailService } = createService()
      prisma.user.update.mockResolvedValue({})

      const { resetUrl } = await service.createResetLink('user-1')

      const match = resetUrl.match(
        /^https:\/\/togglely\.example\.com\/reset-password\?token=([a-f0-9]{64})$/
      )
      expect(match).not.toBeNull()
      const token = match![1]
      const data = prisma.user.update.mock.calls[0][0].data
      expect(prisma.user.update.mock.calls[0][0].where).toEqual({
        id: 'user-1',
      })
      expect(data.resetToken).toBe(hashToken(token))
      expect(data.resetToken).not.toBe(token)
      // no mail for admin/CLI generated links
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('expires after one hour', async () => {
      const { service, prisma } = createService()
      prisma.user.update.mockResolvedValue({})
      const before = Date.now()

      const { expiresAt } = await service.createResetLink('user-1')

      const stored = prisma.user.update.mock.calls[0][0].data.resetTokenExpiry
      expect(stored).toEqual(expiresAt)
      const delta = expiresAt.getTime() - before
      expect(delta).toBeGreaterThanOrEqual(3600000 - 1000)
      expect(delta).toBeLessThanOrEqual(3600000 + 1000)
    })

    it('invalidates the previous link by overwriting the stored hash', async () => {
      const { service, prisma } = createService()
      prisma.user.update.mockResolvedValue({})

      const first = await service.createResetLink('user-1')
      const second = await service.createResetLink('user-1')

      expect(first.resetUrl).not.toBe(second.resetUrl)
      const [firstCall, secondCall] = prisma.user.update.mock.calls
      expect(secondCall[0].data.resetToken).not.toBe(
        firstCall[0].data.resetToken
      )
      // the single resetToken field means only the latest hash is valid
      expect(Object.keys(secondCall[0].data).sort()).toEqual([
        'resetToken',
        'resetTokenExpiry',
      ])
    })
  })

  describe('isTokenValid', () => {
    it('only accepts unexpired tokens of active users', async () => {
      const { service, prisma } = createService()
      prisma.user.findFirst.mockResolvedValue(mockUser)

      await expect(service.isTokenValid('tok')).resolves.toBe(true)

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          resetToken: hashToken('tok'),
          resetTokenExpiry: { gt: expect.any(Date) },
          isActive: true,
        },
        select: { id: true },
      })
    })

    it('rejects tokens of deactivated users', async () => {
      const { service, prisma } = createService()
      prisma.user.findFirst.mockResolvedValue(null)

      await expect(service.isTokenValid('tok')).resolves.toBe(false)
    })
  })

  describe('resetPassword', () => {
    it('consumes the token atomically and sets the password', async () => {
      const { service, prisma } = createService()
      prisma.user.findFirst.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never)
      prisma.user.updateMany.mockResolvedValue({ count: 1 })

      await service.resetPassword('valid-token', 'newPassword123')

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          resetToken: hashToken('valid-token'),
          resetTokenExpiry: { gt: expect.any(Date) },
          isActive: true,
        },
        select: { id: true },
      })
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          resetToken: hashToken('valid-token'),
          resetTokenExpiry: { gt: expect.any(Date) },
          isActive: true,
        },
        data: {
          password: 'new-hashed-password',
          resetToken: null,
          resetTokenExpiry: null,
          // revokes existing sessions
          passwordChangedAt: expect.any(Date),
        },
      })
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('throws for invalid or expired token', async () => {
      const { service, prisma } = createService()
      prisma.user.findFirst.mockResolvedValue(null)

      await expect(
        service.resetPassword('invalid-token', 'newPassword123')
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('throws when the token was consumed meanwhile', async () => {
      const { service, prisma } = createService()
      prisma.user.findFirst.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('h' as never)
      prisma.user.updateMany.mockResolvedValue({ count: 0 })

      await expect(
        service.resetPassword('valid-token', 'newPassword123')
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('lets only one of two concurrent submits succeed', async () => {
      const { service, prisma } = createService()
      // Simulates the database: the guarded update matches only while the hash is stored
      let storedHash: string | null = hashToken('valid-token')
      prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
        where.resetToken === storedHash ? mockUser : null
      )
      prisma.user.updateMany.mockImplementation(async ({ where }: any) => {
        if (where.resetToken !== storedHash) return { count: 0 }
        storedHash = null
        return { count: 1 }
      })
      mockBcrypt.hash.mockResolvedValue('h' as never)

      const results = await Promise.allSettled([
        service.resetPassword('valid-token', 'FirstPass1'),
        service.resetPassword('valid-token', 'SecondPass1'),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(NotFoundException)
    })
  })
})
