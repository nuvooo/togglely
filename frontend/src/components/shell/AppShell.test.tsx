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

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/flags']}>
      <Routes>
        <Route path="/" element={<AppShell />}>
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
