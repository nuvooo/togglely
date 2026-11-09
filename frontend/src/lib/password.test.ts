import { describe, expect, it } from 'vitest'
import { passwordIssue } from './password'

describe('passwordIssue', () => {
  it.each([
    ['Ab1', 'too-short'],
    [`Ab1${'x'.repeat(126)}`, 'too-long'],
    ['ABCDEFG1', 'lowercase'],
    ['abcdefg1', 'uppercase'],
    ['Abcdefgh', 'digit'],
  ])('reports %s as %s', (password, issue) => {
    expect(passwordIssue(password)).toBe(issue)
  })

  it('accepts a password matching the backend policy', () => {
    expect(passwordIssue('Secret123')).toBeNull()
  })
})
