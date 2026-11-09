import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn((url: string) =>
      Promise.resolve({
        data:
          url === '/projects'
            ? { projects: [{ id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }] }
            : { organizations: [{ id: 'o1', name: 'Acme', role: 'OWNER' }] },
      })
    ),
  },
}))

import { resetWorkspaceCache, useWorkspace } from './workspace'

describe('useWorkspace', () => {
  beforeEach(() => resetWorkspaceCache())

  it('loads projects and organizations', async () => {
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects[0].name).toBe('Shop')
    expect(result.current.organizations[0].name).toBe('Acme')
    expect(result.current.projectsByOrg('o1')).toHaveLength(1)
  })
})
