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
    config
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
})
