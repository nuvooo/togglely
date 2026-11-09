import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useWorkspaceStore } from '@/store/workspaceStore'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
}))

import { refreshWorkspace } from '@/lib/workspace'
import CreateOrgPage from './CreateOrgPage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/orgs/new']}>
      <Routes>
        <Route path="/orgs/new" element={<CreateOrgPage />} />
        <Route path="/orgs/:orgId/projects" element={<p>org projects</p>} />
      </Routes>
    </MemoryRouter>
  )

describe('CreateOrgPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    api.post.mockReset()
  })

  it('creates the organization and opens it', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({
      data: { organization: { id: 'o9', name: 'Acme' } },
    })
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'New organization' })
    ).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Create organization' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Name'), '  Acme ')
    await user.click(submit)
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/organizations', { name: 'Acme' })
    )
    expect(await screen.findByText('org projects')).toBeInTheDocument()
    expect(refreshWorkspace).toHaveBeenCalled()
    expect(useWorkspaceStore.getState().lastOrgId).toBe('o9')
  })

  it('shows the API error inline', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue({
      response: { status: 400, data: { message: ['name must be shorter'] } },
    })
    renderPage()
    await user.type(screen.getByLabelText('Name'), 'Acme')
    await user.click(
      screen.getByRole('button', { name: 'Create organization' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'name must be shorter'
    )
  })
})
