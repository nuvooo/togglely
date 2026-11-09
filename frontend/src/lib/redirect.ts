/**
 * Validates a `?next=` redirect target. Only same-origin relative paths are
 * allowed: they must start with a single `/`. Protocol-relative URLs (`//host`)
 * and `/\host` (treated like `//host` by browsers) would leave the app, and
 * browsers drop tabs/newlines from URLs, so `/\t/host` is rejected as well.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || next[0] !== '/') return null
  if (next[1] === '/' || next[1] === '\\') return null
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return next
}

/** Login URL that returns to `path` after signing in. */
export const loginPath = (path: string) =>
  `/login?next=${encodeURIComponent(path)}`
