import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/lib/axios', () => ({ default: { get } }))

import { useWorkspaceStore } from '@/store/workspaceStore'
import { expireSession, SESSION_EXPIRED_EVENT } from './session'
import { useWorkspace } from './workspace'

describe('expireSession', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url === '/projects' ? { projects: [{ id: 'p1', name: 'Shop', organizationId: 'o1' }] } : { organizations: [] },
      })
    )
  })

  it('clears token, workspace context and cache, then redirects', async () => {
    localStorage.setItem('token', 't')
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(1))

    const onExpired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    const redirect = vi.fn()
    act(() => expireSession(redirect))
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('togglely-workspace')).toBeNull()
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: null, lastOrgId: null })
    expect(result.current.projects).toEqual([])
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
