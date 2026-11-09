import { ForbiddenException } from '@nestjs/common'
import { AuthController } from './auth.controller'

function createController(userCount = 1) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(userCount) },
  } as any
  const authService = { register: jest.fn() } as any
  const mailService = { isEnabled: jest.fn().mockReturnValue(false) } as any
  const config = { get: jest.fn() } as any
  const controller = new AuthController(
    authService,
    prisma,
    mailService,
    config,
    {} as any
  )
  return { controller, authService }
}

describe('AuthController', () => {
  describe('register', () => {
    it('is closed: registration is invite-only', async () => {
      const { controller, authService } = createController(3)
      const error = await controller.register().catch((e) => e)
      expect(error).toBeInstanceOf(ForbiddenException)
      expect(error.message).toBe('Registration is invite-only')
      expect(authService.register).not.toHaveBeenCalled()
    })

    it('points to the setup on a fresh instance', async () => {
      const { controller, authService } = createController(0)
      const error = await controller.register().catch((e) => e)
      expect(error).toBeInstanceOf(ForbiddenException)
      expect(error.message).toMatch(/\/setup/)
      expect(authService.register).not.toHaveBeenCalled()
    })
  })

  describe('resendVerification', () => {
    it('finds legacy mixed-case accounts and mails their stored address', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'Ada@Example.com',
            emailVerified: false,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      } as any
      const mailService = {
        isEnabled: jest.fn().mockReturnValue(true),
        sendVerificationEmail: jest.fn().mockResolvedValue(true),
      } as any
      const controller = new AuthController(
        {} as any,
        prisma,
        mailService,
        { get: jest.fn() } as any,
        {} as any
      )

      await controller.resendVerification({ email: 'ada@example.com' })

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'ada@example.com', mode: 'insensitive' } },
      })
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'Ada@Example.com',
        expect.any(String),
        'http://localhost:3000'
      )
    })
  })

  describe('throttling', () => {
    it.each(['acceptInvite', 'acceptPendingInvite'] as const)(
      '%s is rate limited (20 per 15 minutes)',
      (method) => {
        const handler = AuthController.prototype[method]
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(20)
        expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
          900000
        )
      }
    )
  })
})
