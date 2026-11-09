import {
  assertPublicUrl,
  DNS_TIMEOUT_MS,
  isBlockedAddress,
  isBlockedHostname,
  resolvePublicAddress,
  WebhookUrlError,
} from './ssrf-guard'

describe('isBlockedAddress', () => {
  it.each([
    // IPv4 private / special-purpose ranges
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '127.255.255.255',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.0.1',
    '192.168.255.255',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    // IPv6
    '::',
    '::1',
    '0:0:0:0:0:0:0:1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '100::1',
    // IPv4-mapped / embedded IPv4
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '0:0:0:0:0:ffff:c0a8:0101',
    '::127.0.0.1',
    '64:ff9b::a00:1',
    '2002:c0a8:0101::1',
    // Teredo 2001::/32 (embeds an obfuscated IPv4 address)
    '2001::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '2001:0:ffff:ffff:ffff:ffff:ffff:ffff',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.255',
    '100.128.0.0',
    '172.15.255.255',
    '172.32.0.1',
    '169.253.255.255',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
    '2606:4700:4700::1111',
    '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:808:808::1',
    // Outside Teredo: 2001:1::/32 and 2001:4860:: (Google)
    '2001:1::1',
    '2001:4860:4860::8888',
  ])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })

  it('blocks values that are not IP addresses', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
    expect(isBlockedAddress('')).toBe(true)
  })
})

describe('isBlockedHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'foo.localhost',
    'a.b.localhost.',
  ])('blocks %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true)
  })

  it.each(['example.com', 'localhost.example.com', 'mylocalhost'])(
    'allows %s',
    (host) => {
      expect(isBlockedHostname(host)).toBe(false)
    }
  )
})

describe('assertPublicUrl', () => {
  const strict = { allowPrivate: false, allowInsecure: false }

  function codeOf(fn: () => unknown): string | undefined {
    try {
      fn()
    } catch (error) {
      if (error instanceof WebhookUrlError) return error.code
      throw error
    }
    return undefined
  }

  it('accepts a public https URL and returns the parsed URL', () => {
    const url = assertPublicUrl(
      'https://hooks.example.com/togglely?x=1',
      strict
    )
    expect(url.hostname).toBe('hooks.example.com')
  })

  it.each([
    'https://127.0.0.1/hook',
    'https://127.1/hook',
    'https://0x7f000001/hook',
    'https://2130706433/hook',
    'https://0177.0.0.1/hook',
    'https://[::1]/hook',
    'https://[::ffff:10.0.0.1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://10.1.2.3:8443/hook',
    'https://192.168.1.10/hook',
    'https://localhost/hook',
    'https://LOCALHOST:3000/hook',
    'https://api.localhost/hook',
    'https://[fd00::1]/hook',
  ])('rejects private target %s', (url) => {
    expect(codeOf(() => assertPublicUrl(url, strict))).toBe(
      'blocked_private_address'
    )
  })

  it('allows private targets with allowPrivate', () => {
    expect(
      codeOf(() =>
        assertPublicUrl('https://127.0.0.1/hook', {
          allowPrivate: true,
          allowInsecure: false,
        })
      )
    ).toBeUndefined()
  })

  it('requires https unless allowInsecure', () => {
    expect(
      codeOf(() => assertPublicUrl('http://example.com/hook', strict))
    ).toBe('insecure_scheme')
    expect(
      codeOf(() =>
        assertPublicUrl('http://example.com/hook', {
          allowPrivate: false,
          allowInsecure: true,
        })
      )
    ).toBeUndefined()
  })

  it.each([
    'ftp://example.com/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'gopher://x',
  ])('rejects unsupported scheme %s', (url) => {
    expect(
      codeOf(() =>
        assertPublicUrl(url, { allowPrivate: true, allowInsecure: true })
      )
    ).toBe('insecure_scheme')
  })

  it.each(['https://user:pass@example.com/', 'https://user@example.com/'])(
    'rejects credentials in %s',
    (url) => {
      expect(codeOf(() => assertPublicUrl(url, strict))).toBe(
        'credentials_in_url'
      )
    }
  )

  it.each(['not a url', '', 'https://', '//example.com'])(
    'rejects invalid URL %p',
    (url) => {
      expect(codeOf(() => assertPublicUrl(url, strict))).toBe('invalid_url')
    }
  )
})

describe('resolvePublicAddress', () => {
  const lookupReturning = (
    ...addresses: Array<{ address: string; family: number }>
  ) => jest.fn().mockResolvedValue(addresses)

  it('returns the first resolved public address', async () => {
    const lookup = lookupReturning(
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 }
    )
    await expect(
      resolvePublicAddress('example.com', { allowPrivate: false, lookup })
    ).resolves.toEqual({ address: '93.184.216.34', family: 4 })
    expect(lookup).toHaveBeenCalledWith('example.com', {
      all: true,
      verbatim: true,
    })
  })

  it('blocks when any resolved address is private (DNS rebinding)', async () => {
    const lookup = lookupReturning(
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 }
    )
    await expect(
      resolvePublicAddress('evil.example', { allowPrivate: false, lookup })
    ).rejects.toMatchObject({ code: 'blocked_private_address' })
  })

  it.each(['127.0.0.1', '::ffff:169.254.169.254', 'fe80::1'])(
    'blocks hostnames resolving to %s',
    async (address) => {
      const lookup = lookupReturning({
        address,
        family: address.includes(':') ? 6 : 4,
      })
      await expect(
        resolvePublicAddress('evil.example', { allowPrivate: false, lookup })
      ).rejects.toMatchObject({ code: 'blocked_private_address' })
    }
  )

  it('blocks localhost without a DNS lookup', async () => {
    const lookup = jest.fn()
    await expect(
      resolvePublicAddress('localhost', { allowPrivate: false, lookup })
    ).rejects.toMatchObject({ code: 'blocked_private_address' })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('handles IP literals (with brackets) without DNS', async () => {
    const lookup = jest.fn()
    await expect(
      resolvePublicAddress('[2606:4700:4700::1111]', {
        allowPrivate: false,
        lookup,
      })
    ).resolves.toEqual({ address: '2606:4700:4700::1111', family: 6 })
    await expect(
      resolvePublicAddress('[::1]', { allowPrivate: false, lookup })
    ).rejects.toMatchObject({ code: 'blocked_private_address' })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('allows private addresses with allowPrivate', async () => {
    const lookup = lookupReturning({ address: '127.0.0.1', family: 4 })
    await expect(
      resolvePublicAddress('localhost', { allowPrivate: true, lookup })
    ).resolves.toEqual({ address: '127.0.0.1', family: 4 })
  })

  it('reports DNS failures as dns_error', async () => {
    const lookup = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
      )
    await expect(
      resolvePublicAddress('missing.example', { allowPrivate: false, lookup })
    ).rejects.toMatchObject({ code: 'dns_error' })
  })

  it('reports a hanging DNS lookup as dns_error after the timeout', async () => {
    jest.useFakeTimers()
    try {
      const lookup = jest.fn(() => new Promise<never>(() => undefined))
      const pending = resolvePublicAddress('slow.example', {
        allowPrivate: false,
        lookup,
      })
      const assertion = expect(pending).rejects.toMatchObject({
        code: 'dns_error',
      })
      await jest.advanceTimersByTimeAsync(DNS_TIMEOUT_MS - 1)
      let settled = false
      pending.catch(() => undefined).finally(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      await assertion
    } finally {
      jest.useRealTimers()
    }
  })

  it('uses a 5 second DNS timeout', () => {
    expect(DNS_TIMEOUT_MS).toBe(5_000)
  })

  it('reports an empty DNS answer as dns_error', async () => {
    const lookup = lookupReturning()
    await expect(
      resolvePublicAddress('empty.example', { allowPrivate: false, lookup })
    ).rejects.toMatchObject({ code: 'dns_error' })
  })
})
