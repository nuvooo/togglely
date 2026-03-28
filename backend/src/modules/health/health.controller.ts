import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { Response } from 'express'
import { PrismaService } from '../../shared/prisma.service'

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  @Get('deep')
  async deepHealth(@Res() res: Response) {
    const result: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {},
    }

    let allHealthy = true

    // Check MongoDB connectivity
    try {
      const dbStart = Date.now()
      await this.prisma.$runCommandRaw({ ping: 1 })
      const dbLatency = Date.now() - dbStart
      ;(result.services as Record<string, unknown>).database = {
        status: 'connected',
        latencyMs: dbLatency,
      }
    } catch {
      allHealthy = false
      ;(result.services as Record<string, unknown>).database = {
        status: 'disconnected',
      }
    }

    if (!allHealthy) {
      result.status = 'degraded'
    }

    res
      .status(allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(result)
  }
}
