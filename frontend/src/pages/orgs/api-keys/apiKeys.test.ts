import { describe, expect, it } from 'vitest'
import { displayKey, expiryState, mcpAddCommand } from './apiKeys'

describe('api key helpers', () => {
  it('shortens full keys and keeps masked ones', () => {
    expect(displayKey(`tk_${'a'.repeat(60)}beef`)).toBe('tk_aaaa…beef')
    expect(displayKey('tk_aaaa…beef')).toBe('tk_aaaa…beef')
    expect(displayKey('short')).toBe('…')
    expect(displayKey('')).toBe('…')
  })

  it('classifies the expiry', () => {
    const now = Date.parse('2026-11-09T10:00:00.000Z')
    expect(expiryState(null, now)).toBe('never')
    expect(expiryState('garbage', now)).toBe('never')
    expect(expiryState('2026-11-09T09:00:00.000Z', now)).toBe('expired')
    expect(expiryState('2026-11-12T10:00:00.000Z', now)).toBe('soon')
    expect(expiryState('2026-12-31T10:00:00.000Z', now)).toBe('valid')
  })

  it('builds the claude mcp add command with an absolute base', () => {
    expect(mcpAddCommand('/api', 'tkm_x')).toBe(
      `claude mcp add --transport http togglely ${window.location.origin}/api/mcp --header "Authorization: Bearer tkm_x"`
    )
    expect(mcpAddCommand('https://api.example.com/api/', 'tkm_x')).toBe(
      'claude mcp add --transport http togglely https://api.example.com/api/mcp --header "Authorization: Bearer tkm_x"'
    )
  })
})
