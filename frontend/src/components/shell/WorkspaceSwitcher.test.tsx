import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const state = vi.hoisted(() => ({
  value: {
    projects: [] as unknown[],
    organizations: [] as unknown[],
    isLoading: false,
    error: null as unknown,
  },
}))
const refreshWorkspace = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({ ...state.value, projectsByOrg: () => [] }),
  refreshWorkspace,
}))

import { WorkspaceSwitcher } from './WorkspaceSwitcher'

const open = (kind: 'project' | 'org') => {
  render(
    <MemoryRouter>
      <WorkspaceSwitcher kind={kind} />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button'))
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    refreshWorkspace.mockClear()
    state.value = { projects: [], organizations: [], isLoading: false, error: null }
  })

  it('shows an error with retry instead of "no projects" when loading failed', async () => {
    state.value = { ...state.value, error: new Error('boom') }
    open('project')
    expect(await screen.findByText(/nicht geladen|could not load/i)).toBeInTheDocument()
    expect(screen.queryByText(/noch keine projekte|no projects yet/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /erneut versuchen|retry/i }))
    expect(refreshWorkspace).toHaveBeenCalledTimes(1)
  })

  it('shows the error for organizations too', async () => {
    state.value = { ...state.value, error: new Error('boom') }
    open('org')
    expect(await screen.findByRole('button', { name: /erneut versuchen|retry/i })).toBeInTheDocument()
    expect(screen.queryByText(/noch keine organisationen|no organizations yet/i)).toBeNull()
  })

  it('shows the empty hint without error', async () => {
    open('project')
    expect(await screen.findByText(/noch keine projekte|no projects yet/i)).toBeInTheDocument()
  })
})
