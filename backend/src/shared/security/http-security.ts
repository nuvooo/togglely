import { Logger } from '@nestjs/common'

const logger = new Logger('Security')

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'change-this-secret-in-production',
  'your-jwt-secret',
  'secret',
  'changeme',
])

/**
 * Validates security-relevant configuration at startup. In production an
 * insecure configuration aborts the boot instead of running exposed.
 */
export function assertSecureConfig(env: NodeJS.ProcessEnv = process.env) {
  const isProduction = env.NODE_ENV === 'production'
  const problems: string[] = []
  const secret = env.JWT_SECRET ?? ''

  if (!secret) {
    problems.push('JWT_SECRET is not set')
  } else if (secret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters long')
  } else if (KNOWN_PLACEHOLDER_SECRETS.has(secret)) {
    problems.push('JWT_SECRET uses a publicly known placeholder value')
  }

  if (isProduction && env.ENABLE_DEMO_RESET === 'true') {
    logger.warn(
      'ENABLE_DEMO_RESET=true: the demo reset endpoint is publicly reachable'
    )
  }

  if (problems.length === 0) return

  const message = `Insecure configuration: ${problems.join('; ')}`
  if (isProduction) {
    throw new Error(message)
  }
  logger.warn(message)
}

/** Parses the comma separated CORS_ORIGINS value. */
export function parseOriginList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o)
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin)
  } catch {
    return null
  }
}

/**
 * Returns true if `origin` matches one of the allowed entries. Supports exact
 * origins (`https://app.example.com`) and subdomain wildcards
 * (`*.example.com`), matched on the parsed hostname so that
 * `https://evilexample.com` does not match `*.example.com`.
 */
export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  const parsed = parseOrigin(origin)
  if (!parsed) return false

  return allowed.some((entry) => {
    if (entry.startsWith('*.')) {
      const domain = entry.slice(2).toLowerCase()
      const host = parsed.hostname.toLowerCase()
      return host === domain || host.endsWith(`.${domain}`)
    }
    const allowedOrigin = parseOrigin(entry)
    return !!allowedOrigin && allowedOrigin.origin === parsed.origin
  })
}

/** True for routes that are called from customer websites by the SDK. */
export function isSdkPath(path: string | undefined): boolean {
  return !!path && (path.startsWith('/sdk/') || path.startsWith('/api/sdk/'))
}

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(\/auth\/verify-email\/)[^/?]+/,
  /(\/auth\/invite\/)[^/?]+/,
]

/**
 * Removes secrets from a URL before it is logged: drops the query string
 * (may contain `apiKey` or reset tokens) and masks tokens in path segments.
 */
export function redactUrl(url: string | undefined): string {
  if (!url) return ''
  let path = url.split('?')[0]
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    path = path.replace(pattern, '$1[REDACTED]')
  }
  return path
}

/**
 * Minimal fixed-window, in-memory rate limiter keyed by client IP. Used for
 * the raw SDK routes, which bypass the Nest ThrottlerGuard. For multiple
 * replicas, add a shared limit at the reverse proxy as well.
 */
export function createIpRateLimiter(options: {
  windowMs: number
  limit: number
}) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key)
    }
  }, options.windowMs)
  cleanup.unref()

  return (req: any, res: any, next: () => void) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    let entry = hits.get(key)

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs }
      hits.set(key, entry)
    }

    entry.count++
    if (entry.count > options.limit) {
      res.setHeader(
        'Retry-After',
        Math.ceil((entry.resetAt - now) / 1000).toString()
      )
      res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' })
      return
    }

    next()
  }
}
