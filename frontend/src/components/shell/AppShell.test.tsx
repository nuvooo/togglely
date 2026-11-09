import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
  resetWorkspaceCache: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { invites: [], featureFlags: [] } })) },
}))

import AppShell from './AppShell'

function renderShell(path = '/projects/p1/flags') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route path="projects" element={<div>picker page</div>} />
          <Route path="projects/:projectId/flags" element={<div>flags page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppShell mobile drawer', () => {
  it('opens as a modal dialog and closes with Escape', async () => {
    renderShell()
    expect(screen.queryByRole('dialog')).toBeNull()

    const trigger = screen.getByRole('button', { name: /menü öffnen|open menu/i })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: /menü|menu/i })
    expect(dialog).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('AppShell top bar and landmarks', () => {
  it('offers language and theme switching', () => {
    renderShell()
    expect(screen.getByRole('button', { name: /^sprache$|^language$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^design$|^theme$/i })).toBeInTheDocument()
  })

  it('has a skip link that focuses the main content', () => {
    renderShell()
    const skip = screen.getByRole('link', { name: /zum inhalt springen|skip to content/i })
    expect(skip).toHaveAttribute('href', '#main-content')
    fireEvent.click(skip)
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('shows no context column on the project picker', () => {
    renderShell('/projects')
    expect(screen.getByText('picker page')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /bereichsnavigation|section navigation/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /menü öffnen|open menu/i })).toBeNull()
  })
})
