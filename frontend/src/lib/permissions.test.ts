import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const workspace = vi.hoisted(() => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  state: {
    projects: [] as { id: string; organizationId: string }[],
    organizations: [] as { id: string; role?: string }[],
    isLoading: false,
    error: null as unknown,
  },
}))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: workspace.refreshWorkspace,
  useWorkspace: () => workspace.state,
}))

import {
  handleForbidden,
  hasRole,
  notifyWriteError,
  useProjectRole,
} from './permissions'

const t = ((key: string) => key) as never
const httpError = (status: number, message = 'boom') => ({
  isAxiosError: true,
  message: 'Request failed',
  response: { status, data: { message } },
})

beforeEach(() => {
  vi.clearAllMocks()
  workspace.state = {
    projects: [{ id: 'p1', organizationId: 'o1' }],
    organizations: [{ id: 'o1', role: 'MEMBER' }],
    isLoading: false,
    error: null,
  }
})

describe('hasRole', () => {
  it('ranks VIEWER < MEMBER < ADMIN < OWNER', () => {
    expect(hasRole('MEMBER', 'MEMBER')).toBe(true)
    expect(hasRole('VIEWER', 'MEMBER')).toBe(false)
    expect(hasRole('OWNER', 'ADMIN')).toBe(true)
    expect(hasRole(undefined, 'VIEWER')).toBe(false)
    expect(hasRole('SOMETHING', 'VIEWER')).toBe(false)
  })
})

describe('write errors', () => {
  it('a 403 toasts "no permission" and reloads the workspace', () => {
    notifyWriteError(httpError(403), t, 'fallback')

    expect(toast.error).toHaveBeenCalledWith('permissions.forbidden')
    expect(workspace.refreshWorkspace).toHaveBeenCalled()
  })

  it('other errors toast the given message and keep the workspace', () => {
    notifyWriteError(httpError(500), t, 'Save failed')

    expect(toast.error).toHaveBeenCalledWith('Save failed')
    expect(workspace.refreshWorkspace).not.toHaveBeenCalled()
  })

  it('defaults to the API message', () => {
    notifyWriteError(httpError(409, 'Key taken'), t)
    expect(toast.error).toHaveBeenCalledWith('Key taken')
  })

  it('handleForbidden ignores non-403 errors', () => {
    expect(handleForbidden(httpError(500), t)).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('useProjectRole', () => {
  it('MEMBER may edit but not manage', () => {
    const { result } = renderHook(() => useProjectRole('p1'))
    expect(result.current).toMatchObject({
      role: 'MEMBER',
      organizationId: 'o1',
      canEdit: true,
      canManage: false,
      roleUnavailable: false,
    })
  })

  it('VIEWER may do neither', () => {
    workspace.state.organizations = [{ id: 'o1', role: 'VIEWER' }]
    const { result } = renderHook(() => useProjectRole('p1'))
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canManage).toBe(false)
  })

  it('reports a failed workspace load as unavailable role', () => {
    workspace.state = {
      projects: [],
      organizations: [],
      isLoading: false,
      error: new Error('down'),
    }
    const { result } = renderHook(() => useProjectRole('p1'))
    expect(result.current.roleUnavailable).toBe(true)
    expect(result.current.canEdit).toBe(false)
  })
})
