import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { create: () => ({ get }) } }))

import { buildSdkSnippet, fetchSdkFlags } from './sdk-tester'

describe('fetchSdkFlags', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: {} })
  })

  it('calls the public SDK route with the API key header, not the dashboard API', async () => {
    get.mockResolvedValue({ data: { checkout: { value: true, enabled: true, flagType: 'BOOLEAN' } } })

    const flags = await fetchSdkFlags({
      projectKey: 'shop',
      environmentKey: 'production',
      apiKey: 'tk_123',
      context: { country: 'DE' },
    })

    expect(get).toHaveBeenCalledWith('/sdk/flags/shop/production', {
      headers: { 'X-API-Key': 'tk_123' },
      params: { context: '{"country":"DE"}' },
    })
    expect(flags.checkout.value).toBe(true)
  })

  it('omits an empty context', async () => {
    get.mockResolvedValue({ data: {} })
    await fetchSdkFlags({ projectKey: 'p', environmentKey: 'e', apiKey: 'k', context: {} })
    expect(get.mock.calls[0][1].params).toEqual({})
  })

  it('surfaces the API error message', async () => {
    get.mockImplementation(() =>
      Promise.reject({ response: { status: 401, data: { error: 'Invalid API key' } } })
    )
    const error = await fetchSdkFlags({
      projectKey: 'p',
      environmentKey: 'e',
      apiKey: 'bad',
      context: {},
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Invalid API key')
  })
})

describe('buildSdkSnippet', () => {
  const base = {
    apiKey: 'tk_123',
    projectKey: 'shop',
    environmentKey: 'production',
    baseUrl: 'https://togglely.example.com',
    context: { userId: 'u1' },
  }

  it('uses the real flag key and isEnabled for boolean flags', () => {
    const code = buildSdkSnippet({ ...base, flag: { key: 'new-checkout', flagType: 'BOOLEAN' } })
    expect(code).toContain("isEnabled('new-checkout', false)")
    expect(code).toContain("project: 'shop'")
    expect(code).toContain("baseUrl: 'https://togglely.example.com'")
    expect(code).not.toContain('new-dashboard')
  })

  it('uses typed getters for other flag types', () => {
    expect(buildSdkSnippet({ ...base, flag: { key: 'banner', flagType: 'STRING' } })).toContain(
      "getString('banner', '')"
    )
    expect(buildSdkSnippet({ ...base, flag: { key: 'limit', flagType: 'NUMBER' } })).toContain(
      "getNumber('limit', 0)"
    )
    expect(buildSdkSnippet({ ...base, flag: { key: 'cfg', flagType: 'JSON' } })).toContain(
      "getValue('cfg')"
    )
  })

  it('uses a placeholder when no key or flag is known', () => {
    const code = buildSdkSnippet({ ...base, apiKey: '', flag: null })
    expect(code).toContain("apiKey: 'YOUR_API_KEY'")
    expect(code).toContain("isEnabled('your-flag-key', false)")
  })
})
