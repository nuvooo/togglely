import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/lib/axios', () => ({ default: { get } }))

import { refreshWorkspace, resetWorkspaceCache, useWorkspace } from './workspace'

function respond(url: string, projectName = 'Shop') {
  return {
    data:
      url === '/projects'
        ? { projects: [{ id: 'p1', name: projectName, key: 'shop', type: 'SINGLE', organizationId: 'o1' }] }
        : { organizations: [{ id: 'o1', name: 'Acme', role: 'OWNER' }] },
  }
}

describe('useWorkspace', () => {
  beforeEach(() => {
    resetWorkspaceCache()
    get.mockReset()
    get.mockImplementation((url: string) => Promise.resolve(respond(url)))
  })

  it('loads projects and organizations', async () => {
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects[0].name).toBe('Shop')
    expect(result.current.organizations[0].name).toBe('Acme')
    expect(result.current.projectsByOrg('o1')).toHaveLength(1)
  })

  it('does not populate the cache with a load that was in flight during reset', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    get.mockImplementation((url: string) => gate.then(() => respond(url, 'Old user')))

    const first = renderHook(() => useWorkspace())
    expect(get).toHaveBeenCalled()

    act(() => resetWorkspaceCache())
    await act(async () => {
      release()
      await gate
    })
    expect(first.result.current.isLoading).toBe(true)
    expect(first.result.current.projects).toEqual([])
    first.unmount()

    get.mockImplementation((url: string) => Promise.resolve(respond(url, 'New user')))
    const second = renderHook(() => useWorkspace())
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))
    expect(second.result.current.projects[0].name).toBe('New user')
  })

  it('retries a failed load on a later mount', async () => {
    get.mockImplementation(() => Promise.reject(new Error('boom')))
    const first = renderHook(() => useWorkspace())
    await waitFor(() => expect(first.result.current.error).toBeTruthy())
    expect(first.result.current.isLoading).toBe(false)
    first.unmount()

    get.mockImplementation((url: string) => Promise.resolve(respond(url)))
    const second = renderHook(() => useWorkspace())
    await waitFor(() => expect(second.result.current.projects).toHaveLength(1))
    expect(second.result.current.error).toBeNull()
  })

  it('rethrows refresh failures and clears the error after a successful refresh', async () => {
    get.mockImplementation(() => Promise.reject(new Error('boom')))
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.error).toBeTruthy())

    await act(async () => {
      await expect(refreshWorkspace()).rejects.toThrow('boom')
    })
    expect(result.current.error).toBeTruthy()

    get.mockImplementation((url: string) => Promise.resolve(respond(url, 'Fresh')))
    await act(async () => {
      await refreshWorkspace()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.projects[0].name).toBe('Fresh')
  })
})
