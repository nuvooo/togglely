import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { AuthGuard } from './auth.guard'

jest.mock('jsonwebtoken')

const mockJwt = jwt as jest.Mocked<typeof jwt>

function createGuard(user: any = { isActive: true, passwordChangedAt: null }) {
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret'
      return undefined
    }),
  } as any

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as any

  const guard = new AuthGuard(config, prisma)
  return { guard, config, prisma }
}

function createMockContext(authHeader?: string) {
  const request = {
    headers: {
      authorization: authHeader,
    },
    user: undefined as any,
  }

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any

  return { context, request }
}

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows valid token and sets user on request', async () => {
    const { guard } = createGuard()
    const { context, request } = createMockContext('Bearer valid-token')
    const decoded = { userId: 'user-1', email: 'test@example.com', iat: 100 }
    mockJwt.verify.mockReturnValue(decoded as any)

    const result = await guard.canActivate(context)

    expect(result).toBe(true)
    expect(request.user).toEqual(decoded)
    expect(mockJwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret', {
      algorithms: ['HS256'],
    })
  })

  it('throws when no authorization header', async () => {
    const { guard } = createGuard()
    const { context } = createMockContext(undefined)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('throws when authorization header does not start with Bearer', async () => {
    const { guard } = createGuard()
    const { context } = createMockContext('Basic abc123')

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('throws when token is invalid', async () => {
    const { guard } = createGuard()
    const { context } = createMockContext('Bearer invalid-token')
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid token')
    })

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('throws when the token payload has no userId', async () => {
    const { guard } = createGuard()
    const { context } = createMockContext('Bearer token')
    mockJwt.verify.mockReturnValue({ email: 'x@example.com' } as any)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('rejects tokens of deleted users', async () => {
    const { guard } = createGuard(null)
    const { context } = createMockContext('Bearer token')
    mockJwt.verify.mockReturnValue({ userId: 'user-1', iat: 100 } as any)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('rejects tokens of deactivated users', async () => {
    const { guard } = createGuard({ isActive: false, passwordChangedAt: null })
    const { context } = createMockContext('Bearer token')
    mockJwt.verify.mockReturnValue({ userId: 'user-1', iat: 100 } as any)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('rejects tokens issued before the last password change', async () => {
    const { guard } = createGuard({
      isActive: true,
      passwordChangedAt: new Date(200 * 1000),
    })
    const { context } = createMockContext('Bearer token')
    mockJwt.verify.mockReturnValue({ userId: 'user-1', iat: 100 } as any)

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('accepts tokens issued after the last password change', async () => {
    const { guard } = createGuard({
      isActive: true,
      passwordChangedAt: new Date(200 * 1000),
    })
    const { context } = createMockContext('Bearer token')
    mockJwt.verify.mockReturnValue({ userId: 'user-1', iat: 300 } as any)

    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('throws InternalServerError when JWT_SECRET is not configured', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as any
    const guard = new AuthGuard(config, {} as any)
    const { context } = createMockContext('Bearer some-token')

    await expect(guard.canActivate(context)).rejects.toThrow(
      InternalServerErrorException
    )
  })
})
