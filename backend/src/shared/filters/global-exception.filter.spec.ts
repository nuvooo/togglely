import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { GlobalExceptionFilter } from './global-exception.filter'

function createFilter() {
  return new GlobalExceptionFilter()
}

function createMockHost() {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  const response = { status }
  const request = { method: 'GET', url: '/test' }

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as any

  return { host, response, request, status, json }
}

describe('GlobalExceptionFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('HttpException handling', () => {
    it('handles NotFoundException', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      filter.catch(new NotFoundException('Resource not found'), host)

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
        })
      )
    })

    it('handles BadRequestException with validation errors', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const exception = new BadRequestException({
        message: ['name must be a string', 'key is required'],
        error: 'Bad Request',
      })

      filter.catch(exception, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'name must be a string, key is required',
        })
      )
    })

    it('handles HttpException with string response', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN)

      filter.catch(exception, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
        })
      )
    })
  })

  describe('Prisma error handling', () => {
    it('handles P2002 unique constraint error', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const prismaError = { code: 'P2002', meta: { target: ['email'] } }

      filter.catch(prismaError, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
          error: 'Conflict',
        })
      )
    })

    it('handles P2025 record not found error', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const prismaError = { code: 'P2025' }

      filter.catch(prismaError, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        })
      )
    })

    it('handles P2003 foreign key constraint error', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const prismaError = { code: 'P2003' }

      filter.catch(prismaError, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Related record not found',
        })
      )
    })

    it('handles unknown Prisma error as 500', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      const prismaError = { code: 'P9999' }

      filter.catch(prismaError, host)

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal server error',
        })
      )
    })
  })

  describe('Unknown error handling', () => {
    it('handles generic Error as 500', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      filter.catch(new Error('Something broke'), host)

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          // internal details must not leak to the client
          message: 'Internal server error',
        })
      )
    })

    it('handles non-Error objects as 500', () => {
      const filter = createFilter()
      const { host, status, json } = createMockHost()

      filter.catch('string error', host)

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        })
      )
    })
  })

  describe('token redaction', () => {
    it('masks invite tokens in the logged path and the response path', () => {
      const filter = createFilter()
      const { host, request, json } = createMockHost()
      const warn = jest
        .spyOn((filter as any).logger, 'warn')
        .mockImplementation(() => undefined)
      const secret = 'f'.repeat(64)
      Object.assign(request, {
        method: 'POST',
        url: `/auth/invite/${secret}/register`,
        originalUrl: `/api/auth/invite/${secret}/register?x=1`,
        path: `/auth/invite/${secret}/register`,
      })

      filter.catch(new NotFoundException('Invite not found'), host)

      expect(warn.mock.calls[0][0]).not.toContain(secret)
      expect(warn.mock.calls[0][0]).toContain(
        '/api/auth/invite/[REDACTED]/register'
      )
      const body = json.mock.calls[0][0]
      expect(body.path).toBe('/api/auth/invite/[REDACTED]/register')
    })

    it('masks tokens in 5xx error logs', () => {
      const filter = createFilter()
      const { host, request, json } = createMockHost()
      const error = jest
        .spyOn((filter as any).logger, 'error')
        .mockImplementation(() => undefined)
      Object.assign(request, { url: '/auth/verify-email/abc123' })

      filter.catch(new Error('boom'), host)

      expect(error.mock.calls[0][0]).not.toContain('abc123')
      expect(json.mock.calls[0][0].path).toBe('/auth/verify-email/[REDACTED]')
    })
  })
})
