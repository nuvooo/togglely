import { LookupAddress } from 'node:dns'
import { Agent, fetch } from 'undici'
import {
  assertPublicUrl,
  LookupAllFn,
  resolvePublicAddress,
  UrlPolicy,
  WebhookUrlError,
} from './ssrf-guard'

export const WEBHOOK_TIMEOUT_MS = 10_000
/** Max. stored response body (bytes) */
export const RESPONSE_BODY_LIMIT = 1024

export interface HttpAttemptResult {
  ok: boolean
  responseCode?: number
  responseBody?: string
  /**
   * Machine-readable failure reason: blocked_private_address, insecure_scheme,
   * credentials_in_url, invalid_url, dns_error, timeout, redirect_not_followed,
   * unexpected_status, connection_failed[: CODE]
   */
  error?: string
  durationMs: number
}

export interface WebhookRequest {
  url: string
  body: string
  headers: Record<string, string>
  policy: UrlPolicy
  timeoutMs?: number
  /** DNS lookup override (tests) */
  lookup?: LookupAllFn
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void

/** Undici agent whose connections always go to the pre-validated address. */
function pinnedAgent(address: string, family: 4 | 6): Agent {
  const lookup = (
    _hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: LookupCallback
  ) => {
    if (typeof options === 'object' && options?.all) {
      callback(null, [{ address, family }])
    } else {
      callback(null, address, family)
    }
  }
  // A fresh agent is created per request and destroyed in
  // sendWebhookRequest's finally block; that is what keeps connections from
  // being reused across deliveries. pipelining: 0 only disables HTTP/1.1
  // pipelining on this agent's own connection.
  return new Agent({
    connect: { lookup: lookup as never },
    pipelining: 0,
  })
}

async function readLimited(
  body: ReadableStream<Uint8Array> | null
): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (size < RESPONSE_BODY_LIMIT) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
    }
  } finally {
    // Stop downloading large bodies
    reader.cancel().catch(() => undefined)
  }
  const buffer = Buffer.concat(chunks).subarray(0, RESPONSE_BODY_LIMIT)
  return buffer.toString('utf8')
}

function errorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string })?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/**
 * Sends one webhook HTTP request with SSRF protection: URL policy check,
 * DNS resolution with validation of every address, connection pinned to the
 * validated address, no redirects, hard timeout and bounded response body.
 * Never throws.
 */
export async function sendWebhookRequest(
  request: WebhookRequest
): Promise<HttpAttemptResult> {
  const started = Date.now()
  const done = (result: Omit<HttpAttemptResult, 'durationMs'>) => ({
    ...result,
    durationMs: Date.now() - started,
  })

  let agent: Agent | undefined
  try {
    const url = assertPublicUrl(request.url, request.policy)
    const target = await resolvePublicAddress(url.hostname, {
      allowPrivate: request.policy.allowPrivate,
      lookup: request.lookup,
    })
    agent = pinnedAgent(target.address, target.family)

    const response = await fetch(url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutMs ?? WEBHOOK_TIMEOUT_MS),
      dispatcher: agent,
    })
    const responseBody = await readLimited(
      response.body as ReadableStream<Uint8Array> | null
    )
    const status = response.status
    if (status >= 200 && status < 300) {
      return done({ ok: true, responseCode: status, responseBody })
    }
    return done({
      ok: false,
      responseCode: status,
      responseBody,
      error:
        status >= 300 && status < 400
          ? 'redirect_not_followed'
          : 'unexpected_status',
    })
  } catch (error) {
    if (error instanceof WebhookUrlError)
      return done({ ok: false, error: error.code })
    if (isTimeout(error)) return done({ ok: false, error: 'timeout' })
    const code = errorCode(error)
    return done({
      ok: false,
      error: code ? `connection_failed: ${code}` : 'connection_failed',
    })
  } finally {
    agent?.destroy().catch(() => undefined)
  }
}
