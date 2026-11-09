import {
  SDK_CORS_ALLOWED_HEADERS,
  SDK_CORS_ALLOWED_METHODS,
  SDK_ERROR_CODES,
} from './sdk.constants'

export type SdkRequestLike = {
  headers: Record<string, string | string[] | undefined>
  query: Record<string, unknown>
}

export function extractSdkApiKey(req: SdkRequestLike): string | undefined {
  const queryApiKey =
    typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined
  const authHeader = getHeader(req.headers, 'authorization')
  const bearerKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined
  const headerApiKey = getHeader(req.headers, 'x-api-key')

  return queryApiKey || bearerKey || headerApiKey
}

export function extractSdkOrigin(req: SdkRequestLike): string | undefined {
  return getHeader(req.headers, 'origin')
}

/**
 * Brand of an SDK request: `?brandKey=` / `?tenantId=` (sent by the SDK
 * client) or, as a fallback, `brandKey` / `tenantId` in the parsed context.
 */
export function extractEffectiveBrandKey(
  query: Record<string, unknown>,
  context: Record<string, unknown> = {}
): string | undefined {
  const pick = (source: Record<string, unknown>, key: string) =>
    typeof source[key] === 'string' && source[key] ? (source[key] as string) : undefined

  return (
    pick(query, 'brandKey') ||
    pick(query, 'tenantId') ||
    pick(context, 'brandKey') ||
    pick(context, 'tenantId')
  )
}

export const SDK_CONTEXT_MAX_LENGTH = 4096
export const SDK_CONTEXT_MAX_KEYS = 50
export const SDK_CONTEXT_VALUE_MAX_LENGTH = 1024
const SDK_CONTEXT_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/
const FORBIDDEN_CONTEXT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Parses the `context` query parameter sent by the SDK
 * (`?context=<JSON object>`) into a flat targeting context. Untrusted input:
 * size-limited, only safe keys and primitive values are kept; anything
 * invalid yields an empty context instead of an error.
 */
export function parseSdkContext(
  query: Record<string, unknown>
): Record<string, string | number | boolean> {
  const raw = query.context
  if (typeof raw !== 'string' || raw.length === 0) return {}
  if (raw.length > SDK_CONTEXT_MAX_LENGTH) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const context: Record<string, string | number | boolean> = Object.create(null)
  let count = 0
  for (const [key, value] of Object.entries(parsed)) {
    if (count >= SDK_CONTEXT_MAX_KEYS) break
    if (FORBIDDEN_CONTEXT_KEYS.has(key) || !SDK_CONTEXT_KEY_PATTERN.test(key)) {
      continue
    }
    if (typeof value === 'string') {
      if (value.length > SDK_CONTEXT_VALUE_MAX_LENGTH) continue
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
    } else if (typeof value !== 'boolean') {
      continue
    }
    context[key] = value
    count++
  }
  return { ...context }
}

export function setSdkCorsHeaders(
  res: { setHeader: (name: string, value: string) => void },
  origin?: string
): void {
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', SDK_CORS_ALLOWED_METHODS)
  res.setHeader('Access-Control-Allow-Headers', SDK_CORS_ALLOWED_HEADERS)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
}

export function mapSdkError(error: { status?: number; message?: string }): {
  status: number
  body: { error: string; code: string }
} {
  // Only known SDK error conditions are mapped to specific responses. Their
  // client-facing messages are fixed strings: raw error messages (e.g. from
  // Prisma) must never be reflected to SDK clients.
  const message = typeof error?.message === 'string' ? error.message : ''
  const status = error?.status

  if (status === 401 || message.includes('Invalid API key')) {
    return {
      status: 401,
      body: { error: 'Invalid API key', code: SDK_ERROR_CODES.invalidApiKey },
    }
  }

  if (status === 403 || message.includes('Origin not allowed')) {
    return {
      status: 403,
      body: {
        error: 'Origin not allowed',
        code: SDK_ERROR_CODES.originNotAllowed,
      },
    }
  }

  if (message.includes('Project not found')) {
    return {
      status: 404,
      body: {
        error: 'Project not found',
        code: SDK_ERROR_CODES.projectNotFound,
      },
    }
  }

  if (message.includes('Environment not found')) {
    return {
      status: 404,
      body: {
        error: 'Environment not found',
        code: SDK_ERROR_CODES.environmentNotFound,
      },
    }
  }

  return {
    status: 500,
    body: { error: 'Internal error', code: SDK_ERROR_CODES.internalError },
  }
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name]
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value[0]
  }
  return undefined
}
