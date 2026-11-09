import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('axios', () => ({ default: { create: () => ({ get }) } }))

import { buildSdkSnippet, fetchBrandMatrix, fetchSdkFlags } from './sdk-tester'

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

  it('sends the brand as brandKey query parameter like the SDK client', async () => {
    await fetchSdkFlags({
      projectKey: 'shop',
      environmentKey: 'production',
      apiKey: 'tk_123',
      context: {},
      brandKey: 'keramundo',
    })
    expect(get.mock.calls[0][1].params).toEqual({ brandKey: 'keramundo' })
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

describe('fetchBrandMatrix', () => {
  beforeEach(() => get.mockReset())

  it('evaluates the defaults and every brand and pivots per flag', async () => {
    get.mockImplementation((_url: string, config?: { params?: Record<string, string> }) => {
      const params = config?.params ?? {}
      if (params.brandKey === 'broken') {
        return Promise.reject({ response: { status: 404, data: { error: 'Brand not found' } } })
      }
      const on = params.brandKey === 'keramundo'
      return Promise.resolve({
        data: { 'ki-search': { value: on, enabled: on, flagType: 'BOOLEAN' } },
      })
    })

    const matrix = await fetchBrandMatrix({
      projectKey: 'stark',
      environmentKey: 'development',
      apiKey: 'tk',
      context: {},
      brands: [
        { key: 'keramundo', name: 'Keramundo' },
        { key: 'broken', name: 'Broken' },
      ],
    })

    expect(matrix.columns.map((c) => c.key)).toEqual([null, 'keramundo', 'broken'])
    expect(matrix.rows).toHaveLength(1)
    const row = matrix.rows[0]
    expect(row.flagKey).toBe('ki-search')
    expect(row.cells.default).toMatchObject({ value: false, enabled: false })
    expect(row.cells.keramundo).toMatchObject({ value: true, enabled: true })
    expect(matrix.errors.broken).toBe('Brand not found')
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

  it('puts the brand into the context for multi-brand projects', () => {
    const code = buildSdkSnippet({
      ...base,
      brandKey: 'keramundo',
      flag: { key: 'ki-search', flagType: 'BOOLEAN' },
    })
    expect(code).toContain('"brandKey": "keramundo"')
  })

  it('uses a placeholder when no key or flag is known', () => {
    const code = buildSdkSnippet({ ...base, apiKey: '', flag: null })
    expect(code).toContain("apiKey: 'YOUR_API_KEY'")
    expect(code).toContain("isEnabled('your-flag-key', false)")
  })
})
