import { createHmac, randomBytes } from 'node:crypto'

export const WEBHOOK_SECRET_PREFIX = 'whsec_'

/**
 * Value of the `X-Togglely-Signature` header:
 * `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
 * Receivers recompute the HMAC over the raw body and compare in constant
 * time; the timestamp lets them reject replays.
 */
export function signWebhook(
  secret: string,
  timestamp: number,
  body: string
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

/** `whsec_` + 32 random bytes (base64url). */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`
}

/** Masked form for API responses, e.g. `whsec_…abcd`. */
export function maskSecret(secret: string): string {
  const body = secret.startsWith(WEBHOOK_SECRET_PREFIX)
    ? secret.slice(WEBHOOK_SECRET_PREFIX.length)
    : secret
  // Short secrets would be revealed almost completely
  const tail = body.length >= 16 ? body.slice(-4) : ''
  return `${WEBHOOK_SECRET_PREFIX}…${tail}`
}
