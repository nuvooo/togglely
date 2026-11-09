import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useWorkspaceStore } from '@/store/workspaceStore'

const ORG_ID = 'org-1'

const state = vi.hoisted(() => ({ role: 'OWNER' }))
const api = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [],
    organizations: [{ id: 'org-1', name: 'Acme', role: state.role }],
    isLoading: false,
    error: null,
    projectsByOrg: (id: string) =>
      id === 'org-1'
        ? [
            {
              id: 'p1',
              name: 'Shop',
              key: 'shop',
              type: 'SINGLE',
              organizationId: 'org-1',
            },
          ]
        : [],
  }),
}))

import { refreshWorkspace } from '@/lib/workspace'
import OrgSettingsPage from './OrgSettingsPage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/orgs/${ORG_ID}/settings`]}>
      <Routes>
        <Route path="/orgs/:orgId/settings" element={<OrgSettingsPage />} />
        <Route path="/orgs" element={<p>org list</p>} />
      </Routes>
    </MemoryRouter>
  )

describe('OrgSettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    state.role = 'OWNER'
    api.get.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
    vi.mocked(refreshWorkspace).mockClear()
    api.get.mockImplementation((url: string) =>
      url === `/organizations/${ORG_ID}`
        ? Promise.resolve({
            data: {
              organization: {
                id: ORG_ID,
                name: 'Acme',
                slug: 'acme',
                description: 'Shop team',
              },
            },
          })
        : Promise.reject(new Error(`unexpected GET ${url}`))
    )
  })

  it('saves name and description', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({
      data: {
        organization: {
          id: ORG_ID,
          name: 'Acme Inc',
          description: 'Shop team',
        },
      },
    })
    renderPage()
    const name = await screen.findByLabelText('Name')
    expect(name).toHaveValue('Acme')
    expect(screen.getByLabelText('Description')).toHaveValue('Shop team')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.clear(name)
    await user.type(name, 'Acme Inc')
    await user.click(save)
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/organizations/${ORG_ID}`, {
        name: 'Acme Inc',
        description: 'Shop team',
      })
    )
    expect(refreshWorkspace).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('is read-only for members and hides the danger zone below OWNER', async () => {
    state.role = 'MEMBER'
    renderPage()
    expect(await screen.findByLabelText('Name')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Delete organization' })
    ).toBeNull()
  })

  it('lets admins edit but not delete', async () => {
    state.role = 'ADMIN'
    renderPage()
    expect(await screen.findByLabelText('Name')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete organization' })
    ).toBeNull()
  })

  it('deletes the organization after typing its name and forgets it', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.setState({ lastOrgId: ORG_ID, lastProjectId: 'p1' })
    api.delete.mockResolvedValue({ data: { success: true } })
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Delete organization' })
    )
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete organization',
    })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'Acm')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'e')
    await user.click(confirm)

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(`/organizations/${ORG_ID}`)
    )
    expect(await screen.findByText('org list')).toBeInTheDocument()
    expect(useWorkspaceStore.getState().lastOrgId).toBeNull()
    expect(useWorkspaceStore.getState().lastProjectId).toBeNull()
    expect(refreshWorkspace).toHaveBeenCalled()
  })

  it('shows a load error with retry', async () => {
    api.get.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    renderPage()
    expect(
      await screen.findByText('The organization could not be loaded.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Acme')
  })
})
