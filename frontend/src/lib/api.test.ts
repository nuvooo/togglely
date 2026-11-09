import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ expireSession: vi.fn() }))
vi.mock('./session', () => ({ expireSession: mocks.expireSession }))

import api from './api'
import legacy from './axios'

/** Runs the response error interceptor like axios would for a failed call. */
function fail(status: number, headers: Record<string, string> = {}) {
  // biome-ignore lint/suspicious/noExplicitAny: axios keeps handlers internal
  const handler = (api.interceptors.response as any).handlers[0]
  return handler.rejected({ response: { status }, config: { headers } })
}

describe('api client', () => {
  beforeEach(() => mocks.expireSession.mockClear())

  it('is one shared instance for @/lib/api and @/lib/axios', () => {
    expect(legacy).toBe(api)
  })

  it('uses VITE_API_URL or /api as base URL', () => {
    expect(api.defaults.baseURL).toBe(import.meta.env.VITE_API_URL || '/api')
  })

  it('ends the session on a 401 for an authenticated request', async () => {
    await expect(
      fail(401, { Authorization: 'Bearer old' })
    ).rejects.toBeDefined()
    expect(mocks.expireSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the page on a 401 without a session (e.g. wrong login)', async () => {
    await expect(fail(401)).rejects.toBeDefined()
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not end the session on other errors', async () => {
    await expect(
      fail(400, { Authorization: 'Bearer old' })
    ).rejects.toBeDefined()
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })
})
