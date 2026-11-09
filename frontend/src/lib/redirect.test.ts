import { describe, expect, it } from 'vitest'
import { loginPath, safeNextPath } from './redirect'

describe('safeNextPath', () => {
  it.each([
    '/invite/abc',
    '/orgs/1/members?tab=x#y',
    '/',
  ])('allows relative path %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([
    null,
    undefined,
    '',
    'invite/abc',
    'https://evil.example',
    'javascript:alert(1)',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('rejects %j', (path) => {
    expect(safeNextPath(path)).toBeNull()
  })
})

describe('loginPath', () => {
  it('encodes the return path', () => {
    expect(loginPath('/invite/a b')).toBe('/login?next=%2Finvite%2Fa%20b')
  })
})
