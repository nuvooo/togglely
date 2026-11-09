import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'

/** Named throttler for /api/mcp: 120 requests per 60 s per MCP key. */
export const MCP_THROTTLER = { name: 'mcp', limit: 120, ttl: 60_000 }

/**
 * Rate limit for the MCP endpoint, keyed by the SHA-256 of the bearer token
 * (falls back to the client IP). It only knows the separate "mcp" throttler,
 * so `@SkipThrottle()` (which skips the global per-IP "default" throttler)
 * does not disable it.
 */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  async onModuleInit() {
    await super.onModuleInit()
    this.throttlers = [{ ...MCP_THROTTLER }]
  }

  protected async getTracker(req: Request): Promise<string> {
    const header = req.headers.authorization
    const token =
      typeof header === 'string' ? header.match(/^Bearer\s+(\S+)$/i)?.[1] : ''
    if (token) {
      return `mcp-key:${createHash('sha256').update(token).digest('hex')}`
    }
    return `ip:${req.ip}`
  }
}
