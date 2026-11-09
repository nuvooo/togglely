import {
  assertSecureConfig,
  createIpRateLimiter,
  isOriginAllowed,
  isSdkPath,
  parseOriginList,
  redactUrl,
} from './http-security'

describe('assertSecureConfig', () => {
  const strongSecret = 'a'.repeat(48)

  it('accepts a strong secret in production', () => {
    expect(() =>
      assertSecureConfig({ NODE_ENV: 'production', JWT_SECRET: strongSecret })
    ).not.toThrow()
  })

  it.each([
    ['missing', undefined],
    ['too short', 'short-secret'],
    ['a known placeholder', 'your-super-secret-jwt-key-change-in-production'],
  ])('refuses to boot in production when the secret is %s', (_, secret) => {
    expect(() =>
      assertSecureConfig({ NODE_ENV: 'production', JWT_SECRET: secret })
    ).toThrow(/Insecure configuration/)
  })

  it('only warns outside production', () => {
    expect(() =>
      assertSecureConfig({ NODE_ENV: 'development', JWT_SECRET: 'short' })
    ).not.toThrow()
  })
})

describe('isOriginAllowed', () => {
  const allowed = parseOriginList('https://app.example.com, *.example.org')

  it('matches exact origins', () => {
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true)
    expect(isOriginAllowed('http://app.example.com', allowed)).toBe(false)
  })

  it('matches subdomain wildcards on the hostname', () => {
    expect(isOriginAllowed('https://shop.example.org', allowed)).toBe(true)
    expect(isOriginAllowed('https://example.org', allowed)).toBe(true)
  })

  it('rejects look-alike domains', () => {
    expect(isOriginAllowed('https://evilexample.org', allowed)).toBe(false)
    expect(isOriginAllowed('https://app.example.com.evil.io', allowed)).toBe(
      false
    )
  })

  it('rejects malformed origins', () => {
    expect(isOriginAllowed('not a url', allowed)).toBe(false)
  })
})

describe('isSdkPath', () => {
  it('detects SDK routes', () => {
    expect(isSdkPath('/sdk/flags/p/e')).toBe(true)
    expect(isSdkPath('/api/sdk/events/p/e')).toBe(true)
    expect(isSdkPath('/api/projects')).toBe(false)
    expect(isSdkPath(undefined)).toBe(false)
  })
})

describe('redactUrl', () => {
  it('drops query strings', () => {
    expect(redactUrl('/sdk/flags/p/e?apiKey=tk_secret')).toBe('/sdk/flags/p/e')
  })

  it('masks tokens in paths', () => {
    expect(redactUrl('/api/auth/verify-email/abc123')).toBe(
      '/api/auth/verify-email/[REDACTED]'
    )
    expect(redactUrl('/api/auth/invite/tok/accept')).toBe(
      '/api/auth/invite/[REDACTED]/accept'
    )
  })
})

describe('createIpRateLimiter', () => {
  function createRes() {
    const res: any = {}
    res.setHeader = jest.fn()
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
  }

  it('blocks requests over the limit per IP', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, limit: 2 })
    const next = jest.fn()

    limiter({ ip: '1.1.1.1' }, createRes(), next)
    limiter({ ip: '1.1.1.1' }, createRes(), next)
    const blocked = createRes()
    limiter({ ip: '1.1.1.1' }, blocked, next)
    limiter({ ip: '2.2.2.2' }, createRes(), next)

    expect(next).toHaveBeenCalledTimes(3)
    expect(blocked.status).toHaveBeenCalledWith(429)
  })
})
