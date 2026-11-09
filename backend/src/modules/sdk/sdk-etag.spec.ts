import { UnauthorizedException } from '@nestjs/common'
import { computeSdkEtag, etagMatches, handleSdkFlagsRequest } from './sdk-etag'
import { setSdkCorsHeaders } from './sdk-http.utils'

describe('computeSdkEtag', () => {
  it('has the form W/"<version>-<16 hex>"', () => {
    expect(computeSdkEtag(7, undefined, {}, undefined)).toMatch(
      /^W\/"7-[0-9a-f]{16}"$/
    )
  })

  it('is stable regardless of context key order', () => {
    expect(computeSdkEtag(1, 'b', { a: 1, z: 'x' }, 'f')).toBe(
      computeSdkEtag(1, 'b', { z: 'x', a: 1 }, 'f')
    )
  })

  it('differs by version, brand, context and flag key', () => {
    const base = computeSdkEtag(1, 'b', { userId: 'u1' }, 'f')
    expect(computeSdkEtag(2, 'b', { userId: 'u1' }, 'f')).not.toBe(base)
    expect(computeSdkEtag(1, 'c', { userId: 'u1' }, 'f')).not.toBe(base)
    expect(computeSdkEtag(1, 'b', { userId: 'u2' }, 'f')).not.toBe(base)
    expect(computeSdkEtag(1, 'b', { userId: 'u1' }, 'g')).not.toBe(base)
    expect(computeSdkEtag(1, 'b', { userId: 'u1' }, undefined)).not.toBe(base)
  })
})

describe('etagMatches', () => {
  const etag = 'W/"3-0123456789abcdef"'

  it('matches exact, weak/strong variants, lists and *', () => {
    expect(etagMatches(etag, etag)).toBe(true)
    expect(etagMatches('"3-0123456789abcdef"', etag)).toBe(true)
    expect(etagMatches(`"x", ${etag}`, etag)).toBe(true)
    expect(etagMatches('*', etag)).toBe(true)
    expect(etagMatches([etag], etag)).toBe(true)
  })

  it('does not match other or missing values', () => {
    expect(etagMatches(undefined, etag)).toBe(false)
    expect(etagMatches('', etag)).toBe(false)
    expect(etagMatches('W/"2-0123456789abcdef"', etag)).toBe(false)
  })
})

describe('setSdkCorsHeaders', () => {
  it('exposes the ETag header to browsers', () => {
    const headers: Record<string, string> = {}
    setSdkCorsHeaders(
      { setHeader: (k, v) => (headers[k] = v) },
      'https://a.com'
    )
    expect(headers['Access-Control-Expose-Headers']).toContain('ETag')
    expect(headers['Access-Control-Allow-Headers']).toContain('If-None-Match')
  })
})

function createRes() {
  const res: any = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
  }
  res.setHeader = jest.fn((k: string, v: string) => {
    res.headers[k.toLowerCase()] = v
  })
  res.removeHeader = jest.fn((k: string) => {
    delete res.headers[k.toLowerCase()]
  })
  res.status = jest.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = jest.fn((body: unknown) => {
    res.body = body
    res.ended = true
    return res
  })
  res.end = jest.fn(() => {
    res.ended = true
    return res
  })
  return res
}

describe('handleSdkFlagsRequest', () => {
  const access = {
    organizationId: 'org',
    apiKeyId: 'k',
    project: { id: 'p1' },
    environment: { id: 'e1' },
  }

  function setup(version = 4) {
    const sdkService = {
      resolveSdkAccess: jest.fn().mockResolvedValue(access),
      evaluateFlagForAccess: jest.fn().mockResolvedValue({ value: true }),
      getAllFlagsForAccess: jest.fn().mockResolvedValue({ a: { value: 1 } }),
    }
    const changeEvents = { getVersion: jest.fn().mockResolvedValue(version) }
    const logger = { debug: jest.fn(), error: jest.fn() }
    return { sdkService, changeEvents, logger }
  }

  function req(headers: Record<string, string> = {}, query = {}) {
    return {
      params: { projectKey: 'shop', environmentKey: 'dev' },
      query: { apiKey: 'key', ...query },
      headers,
    }
  }

  it('returns flags with ETag and Cache-Control: no-cache', async () => {
    const deps = setup()
    const res = createRes()

    await handleSdkFlagsRequest(deps as any, req() as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ a: { value: 1 } })
    expect(res.headers.etag).toBe(computeSdkEtag(4, undefined, {}, undefined))
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(deps.changeEvents.getVersion).toHaveBeenCalledWith('p1', 'e1')
  })

  it('answers 304 with ETag and without evaluating when the ETag matches', async () => {
    const deps = setup()
    const etag = computeSdkEtag(4, undefined, {}, undefined)
    const res = createRes()

    await handleSdkFlagsRequest(
      deps as any,
      req({ 'if-none-match': etag }) as any,
      res
    )

    expect(res.statusCode).toBe(304)
    expect(res.end).toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
    expect(res.headers.etag).toBe(etag)
    expect(deps.sdkService.getAllFlagsForAccess).not.toHaveBeenCalled()
  })

  it('evaluates again when the version changed', async () => {
    const deps = setup(5)
    const res = createRes()

    await handleSdkFlagsRequest(
      deps as any,
      req({
        'if-none-match': computeSdkEtag(4, undefined, {}, undefined),
      }) as any,
      res
    )

    expect(res.statusCode).toBe(200)
    expect(deps.sdkService.getAllFlagsForAccess).toHaveBeenCalled()
  })

  it('single flag: hashes the flag key and evaluates only that flag', async () => {
    const deps = setup()
    const res = createRes()

    await handleSdkFlagsRequest(
      deps as any,
      req({}, { brandKey: 'acme' }) as any,
      res,
      'my-flag'
    )

    expect(res.headers.etag).toBe(computeSdkEtag(4, 'acme', {}, 'my-flag'))
    expect(deps.sdkService.evaluateFlagForAccess).toHaveBeenCalledWith(
      access,
      'my-flag',
      'acme',
      {}
    )
    expect(res.body).toEqual({ value: true })
  })

  it('rejects an invalid key with 401 even with a matching If-None-Match', async () => {
    const deps = setup()
    deps.sdkService.resolveSdkAccess.mockRejectedValue(
      new UnauthorizedException('Invalid API key')
    )
    const res = createRes()

    await handleSdkFlagsRequest(
      deps as any,
      req({
        'if-none-match': computeSdkEtag(4, undefined, {}, undefined),
      }) as any,
      res
    )

    expect(res.statusCode).toBe(401)
    expect(res.headers.etag).toBeUndefined()
    expect(deps.changeEvents.getVersion).not.toHaveBeenCalled()
  })

  it('requires an API key', async () => {
    const deps = setup()
    const res = createRes()
    const r = req() as any
    r.query = {}

    await handleSdkFlagsRequest(deps as any, r, res)

    expect(res.statusCode).toBe(401)
    expect(deps.sdkService.resolveSdkAccess).not.toHaveBeenCalled()
  })

  it('drops the ETag when evaluation fails', async () => {
    const deps = setup()
    deps.sdkService.getAllFlagsForAccess.mockRejectedValue(new Error('db'))
    const res = createRes()

    await handleSdkFlagsRequest(deps as any, req() as any, res)

    expect(res.statusCode).toBe(500)
    expect(res.headers.etag).toBeUndefined()
  })
})
