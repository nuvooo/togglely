import * as crypto from 'crypto'

/**
 * Generate a MongoDB-compatible ObjectID (24 hex characters)
 */
export function generateObjectId(): string {
  return crypto.randomBytes(12).toString('hex')
}

/** bcrypt cost factor for all password hashes. */
export const BCRYPT_ROUNDS = 12

/**
 * Hash a high-entropy secret token (reset/verify tokens) for storage.
 * Tokens are random, so a fast unsalted SHA-256 is sufficient and allows
 * direct lookup by hash.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Escape a user-controlled value for interpolation into HTML (e.g. emails). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
