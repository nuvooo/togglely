import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { redactUrl } from '../security/http-security'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let error = 'Internal Server Error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resp = exceptionResponse as Record<string, unknown>
        const rawMessage = resp.message
        message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : ((rawMessage as string) ?? message)
        error = (resp.error as string) ?? error
      }
    } else if (this.isPrismaError(exception)) {
      const prismaResult = this.handlePrismaError(exception)
      status = prismaResult.status
      message = prismaResult.message
      error = prismaResult.error
    }

    // Never expose internal error details (Prisma queries, stack info, ...)
    // to clients; they are logged below.
    const internalMessage =
      exception instanceof Error ? exception.message : String(exception)
    // Paths can carry secrets (invite and verification tokens)
    const logPath = redactUrl(request.originalUrl ?? request.url)

    if (status >= 500) {
      message = 'Internal server error'
      this.logger.error(
        `${request.method} ${logPath} ${status} - ${JSON.stringify(internalMessage)}`,
        exception instanceof Error ? exception.stack : undefined
      )
    } else {
      this.logger.warn(
        `${request.method} ${logPath} ${status} - ${JSON.stringify(message)}`
      )
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: logPath,
    })
  }

  private isPrismaError(
    exception: unknown
  ): exception is { code: string; meta?: Record<string, unknown> } {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>).code === 'string' &&
      String((exception as Record<string, unknown>).code).startsWith('P')
    )
  }

  private handlePrismaError(exception: {
    code: string
    meta?: Record<string, unknown>
  }): {
    status: number
    message: string
    error: string
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
          error: 'Conflict',
        }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        }
      case 'P2023':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid identifier',
          error: 'Bad Request',
        }
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record not found',
          error: 'Bad Request',
        }
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'Internal Server Error',
        }
    }
  }
}
