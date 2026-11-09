/**
 * Quotes a value as a single POSIX shell word. Everything inside single
 * quotes is literal; an embedded `'` is closed, escaped and reopened.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
