import { Flag, type FlagType } from '../../domain/flag.entity'

/**
 * Parse an origin string into a normalized `scheme://host[:port]` form plus
 * its lowercase hostname. Returns null for anything that is not a valid
 * http(s) origin (including the literal "null" origin).
 */
function parseOrigin(
  value: string
): { origin: string; hostname: string } | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return { origin: url.origin, hostname: url.hostname.toLowerCase() }
  } catch {
    return null
  }
}

export function isOriginAllowed(
  origin: string,
  allowedOrigins: string[]
): boolean {
  if (typeof origin !== 'string' || !Array.isArray(allowedOrigins)) {
    return false
  }

  const parsedOrigin = parseOrigin(origin)

  return allowedOrigins.some((rawAllowed) => {
    if (typeof rawAllowed !== 'string') {
      return false
    }
    const allowedOrigin = rawAllowed.trim()

    if (allowedOrigin === '*') {
      return true
    }

    if (!parsedOrigin) {
      return false
    }

    // Wildcard subdomain entry: "*.example.com" matches "example.com" and any
    // subdomain of it, but never "evilexample.com".
    if (allowedOrigin.startsWith('*.')) {
      const domain = allowedOrigin.slice(2).toLowerCase().replace(/\.$/, '')
      if (!domain) {
        return false
      }
      const { hostname } = parsedOrigin
      return hostname === domain || hostname.endsWith(`.${domain}`)
    }

    // Exact entry: compare normalized origins (scheme + host + port).
    const parsedAllowed = parseOrigin(allowedOrigin)
    return (
      parsedAllowed !== null && parsedAllowed.origin === parsedOrigin.origin
    )
  })
}

export function getDefaultFlagValue(flagType: FlagType): string {
  switch (flagType) {
    case 'BOOLEAN':
      return 'false'
    case 'NUMBER':
      return '0'
    case 'JSON':
      return '{}'
    case 'STRING':
    default:
      return ''
  }
}

export function toSdkFlagResponse(
  flag: {
    id: string
    key: string
    name: string
    description: string | null
    flagType: FlagType
    projectId: string
    createdById: string | null
    createdAt: Date
    updatedAt: Date
  },
  organizationId: string,
  defaultValue: string,
  enabled: boolean
) {
  const domainFlag = Flag.reconstitute({
    id: flag.id,
    key: flag.key,
    name: flag.name,
    description: flag.description,
    type: flag.flagType,
    projectId: flag.projectId,
    organizationId,
    createdById: flag.createdById || '',
    createdAt: flag.createdAt,
    updatedAt: flag.updatedAt,
  })

  return {
    value: domainFlag.parseValue(defaultValue),
    enabled,
    flagType: flag.flagType,
  }
}
