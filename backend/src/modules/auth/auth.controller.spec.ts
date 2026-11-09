import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
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

  describe('registerWithInvite', () => {
    it('returns the session together with the joined organization', async () => {
      const session = {
        token: 'jwt',
        user: { id: 'u1', email: 'a@b.c', name: 'A', emailVerified: true },
        organizationId: 'org-1',
      }
      const invites = { register: jest.fn().mockResolvedValue(session) }
      const controller = new AuthController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        invites as any
      )
      const body = { firstName: 'A', lastName: 'B', password: 'Secret123' }

      await expect(
        controller.registerWithInvite('tok', body as any)
      ).resolves.toEqual(session)
      expect(invites.register).toHaveBeenCalledWith('tok', body)
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

  describe('changePassword', () => {
    async function setup() {
      const password = await bcrypt.hash('Old12345', 4)
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'u1', password }),
          update: jest.fn().mockResolvedValue({}),
        },
      } as any
      const authService = {
        issueToken: jest.fn().mockResolvedValue('fresh-jwt'),
      } as any
      const controller = new AuthController(
        authService,
        prisma,
        {} as any,
        {} as any,
        {} as any
      )
      return { controller, prisma }
    }
    const req = { user: { userId: 'u1' } }

    // A wrong current password is a validation error, not an expired
    // session: a 401 would make the dashboard log the user out.
    it('rejects a wrong current password with 400, not 401', async () => {
      const { controller, prisma } = await setup()
      const error = await controller
        .changePassword(req, {
          currentPassword: 'Wrong123',
          newPassword: 'Secret123',
        })
        .catch((e) => e)
      expect(error).toBeInstanceOf(BadRequestException)
      expect(error).not.toBeInstanceOf(UnauthorizedException)
      expect(error.message).toBe('Current password is incorrect')
      expect(error.getResponse()).toMatchObject({
        code: 'WRONG_CURRENT_PASSWORD',
      })
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('stores the new hash and returns a fresh token', async () => {
      const { controller, prisma } = await setup()
      await expect(
        controller.changePassword(req, {
          currentPassword: 'Old12345',
          newPassword: 'Secret123',
        })
      ).resolves.toEqual({ success: true, token: 'fresh-jwt' })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          password: expect.any(String),
          passwordChangedAt: expect.any(Date),
        },
      })
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
