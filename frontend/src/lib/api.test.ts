import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expireSession: vi.fn(),
  token: null as string | null,
}))
vi.mock('./session', () => ({
  expireSession: mocks.expireSession,
  getSessionToken: () => mocks.token,
}))

import api, { isPublicEndpoint } from './api'
import legacy from './axios'

/** Runs the response error interceptor like axios would for a failed call. */
function fail(
  status: number,
  headers: Record<string, string> = {},
  url = '/projects'
) {
  // biome-ignore lint/suspicious/noExplicitAny: axios keeps handlers internal
  const handler = (api.interceptors.response as any).handlers[0]
  return handler.rejected({ response: { status }, config: { headers, url } })
}

/** Runs the request interceptor like axios would before sending. */
function prepare(url: string) {
  // biome-ignore lint/suspicious/noExplicitAny: axios keeps handlers internal
  const handler = (api.interceptors.request as any).handlers[0]
  return handler.fulfilled({ url, headers: {} })
}

describe('api client', () => {
  beforeEach(() => {
    mocks.expireSession.mockClear()
    mocks.token = null
  })

  it('is one shared instance for @/lib/api and @/lib/axios', () => {
    expect(legacy).toBe(api)
  })

  it('uses VITE_API_URL or /api as base URL', () => {
    expect(api.defaults.baseURL).toBe(import.meta.env.VITE_API_URL || '/api')
  })

  it('attaches the token of the auth store', () => {
    mocks.token = 'abc'
    expect(prepare('/projects').headers.Authorization).toBe('Bearer abc')
  })

  it('never attaches a (stale) token to public auth endpoints', () => {
    mocks.token = 'stale'
    for (const url of [
      '/auth/login',
      '/auth/register',
      '/setup',
      '/password-reset/request',
      '/auth/invite/tok',
      '/auth/invite/tok/register',
    ]) {
      expect(prepare(url).headers.Authorization).toBeUndefined()
    }
    // Accepting an invite as a logged-in user is authenticated.
    expect(prepare('/auth/invite/tok/accept').headers.Authorization).toBe(
      'Bearer stale'
    )
  })

  it('classifies public endpoints', () => {
    expect(isPublicEndpoint('/auth/login')).toBe(true)
    expect(isPublicEndpoint('/setup/status')).toBe(true)
    expect(isPublicEndpoint('/auth/me')).toBe(false)
    expect(isPublicEndpoint('/auth/change-password')).toBe(false)
    expect(isPublicEndpoint(undefined)).toBe(false)
  })

  it('ends the session on a 401 for an authenticated request', async () => {
    await expect(
      fail(401, { Authorization: 'Bearer old' })
    ).rejects.toBeDefined()
    expect(mocks.expireSession).toHaveBeenCalledTimes(1)
  })

  it('ends the session on a 401 while logged in, even without a header', async () => {
    mocks.token = 'abc'
    await expect(fail(401)).rejects.toBeDefined()
    expect(mocks.expireSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the page on a 401 without a session (e.g. wrong login)', async () => {
    await expect(fail(401)).rejects.toBeDefined()
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('keeps the page on a wrong-password 401 even with a stale token', async () => {
    mocks.token = 'stale'
    await expect(fail(401, {}, '/auth/login')).rejects.toBeDefined()
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not end the session on other errors', async () => {
    await expect(
      fail(400, { Authorization: 'Bearer old' })
    ).rejects.toBeDefined()
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })
})
