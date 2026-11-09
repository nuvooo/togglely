import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'

/** Per-IP bucket for /api/mcp: 600 requests per 60 s, before auth. */
export const MCP_IP_THROTTLER = { name: 'mcp-ip', limit: 600, ttl: 60_000 }
/** Per-key bucket for /api/mcp: 120 requests per 60 s per bearer token. */
export const MCP_KEY_THROTTLER = { name: 'mcp', limit: 120, ttl: 60_000 }

function ipTracker(req: Request): string {
  return `ip:${req.ip}`
}

/** SHA-256 of the bearer token; falls back to the client IP. */
function tokenTracker(req: Request): string {
  const header = req.headers.authorization
  const token =
    typeof header === 'string' ? header.match(/^Bearer\s+(\S+)$/i)?.[1] : ''
  if (token) {
    return `mcp-key:${createHash('sha256').update(token).digest('hex')}`
  }
  return ipTracker(req)
}

/**
 * Rate limit for the MCP endpoint. Runs as a route guard, i.e. before
 * authentication, and checks two separate named throttlers:
 * - "mcp-ip": per client IP, so random bearer strings cannot bypass the
 *   limit (and cause unbounded key lookups);
 * - "mcp": per bearer token, so one key cannot use up a shared IP.
 * It does not know the global "default" throttler, so `@SkipThrottle()`
 * (which skips only "default") does not disable it.
 */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  async onModuleInit() {
    await super.onModuleInit()
    // Order matters: an IP-blocked request must not count against a key
    this.throttlers = [
      { ...MCP_IP_THROTTLER, getTracker: (req) => ipTracker(req as Request) },
      {
        ...MCP_KEY_THROTTLER,
        getTracker: (req) => tokenTracker(req as Request),
      },
    ]
  }
}
