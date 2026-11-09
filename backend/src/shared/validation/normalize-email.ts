import { Transform } from 'class-transformer'

/** Emails are stored and compared trimmed and lowercased. */
export function normalizeEmail<T>(value: T): T | string {
  return typeof value === 'string' ? value.trim().toLowerCase() : value
}

/**
 * Normalizes an incoming email field (trim + lowercase) before validation.
 * Requires the global ValidationPipe with `transform: true`.
 */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => normalizeEmail(value))
}
