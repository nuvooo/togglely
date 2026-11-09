import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/authStore'

const ORG_ID = 'org-1'
const FULL = `tk_${'a'.repeat(60)}beef`

const state = vi.hoisted(() => ({
  role: 'ADMIN',
  keys: [] as unknown[] | Error,
}))
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  defaults: { baseURL: '/api' },
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [],
    organizations: [{ id: ORG_ID, name: 'Acme', role: state.role }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import ApiKeysPage from './ApiKeysPage'

const WEB = {
  id: 'k1',
  name: 'Web app',
  type: 'CLIENT',
  key: FULL,
  isActive: true,
  createdAt: '2026-01-01T10:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
}
const BACKEND = {
  ...WEB,
  id: 'k2',
  name: 'Backend',
  type: 'SERVER',
  expiresAt: '2020-01-01T00:00:00.000Z',
  environmentId: 'env-prod',
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/orgs/${ORG_ID}/api-keys`]}>
      <Routes>
        <Route path="/orgs/:orgId/api-keys" element={<ApiKeysPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('ApiKeysPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    state.role = 'ADMIN'
    state.keys = [WEB, BACKEND]
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', name: 'Ada' },
    })
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
    toast.success.mockClear()
    api.get.mockImplementation((url: string) => {
      if (url === `/api-keys/organization/${ORG_ID}`) {
        return state.keys instanceof Error
          ? Promise.reject(state.keys)
          : Promise.resolve({ data: { apiKeys: state.keys } })
      }
      if (url === `/projects/organization/${ORG_ID}`) {
        return Promise.resolve({
          data: {
            projects: [
              {
                id: 'p1',
                name: 'Shop',
                environments: [
                  { id: 'env-dev', name: 'Development' },
                  { id: 'env-prod', name: 'Production' },
                ],
              },
            ],
          },
        })
      }
      if (url === '/environments/project/p1') {
        return Promise.resolve({
          data: {
            environments: [
              { id: 'env-dev', name: 'Development', key: 'development' },
              { id: 'env-prod', name: 'Production', key: 'production' },
            ],
          },
        })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  it('lists the organization keys masked, with type, binding and expiry', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'API keys' })
    expect(api.get).toHaveBeenCalledWith(`/api-keys/organization/${ORG_ID}`)
    const web = within(table).getByText('Web app').closest('tr') as HTMLElement
    expect(within(web).getByText('tk_aaaa…beef')).toBeInTheDocument()
    expect(within(table).queryByText(FULL)).toBeNull()
    expect(within(web).getByText('Client')).toBeInTheDocument()
    expect(within(web).getByText('Never used')).toBeInTheDocument()
    const backend = within(table)
      .getByText('Backend')
      .closest('tr') as HTMLElement
    expect(within(backend).getByText('Server')).toBeInTheDocument()
    expect(within(backend).getByText(/^Expired/)).toBeInTheDocument()
    expect(
      await within(backend).findByText('Shop · Production')
    ).toBeInTheDocument()
  })

  it('explains CLIENT and SERVER keys', async () => {
    renderPage()
    await screen.findByRole('table')
    expect(screen.getAllByText(/browser/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/secret/i).length).toBeGreaterThan(0)
  })

  it('creates a key and shows it once until saving is confirmed', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({
      data: {
        apiKey: {
          id: 'k3',
          name: 'Worker',
          type: 'SERVER',
          key: 'tk_plain_secret_value',
        },
      },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'New API key' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Worker')
    await user.click(within(dialog).getByRole('radio', { name: /Server/ }))
    await user.selectOptions(within(dialog).getByLabelText('Expires'), '90')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/api-keys/organization/${ORG_ID}`,
        {
          name: 'Worker',
          type: 'SERVER',
          expiresInDays: 90,
        }
      )
    )
    const shown = await screen.findByRole('dialog', { name: 'API key created' })
    expect(
      within(shown).getByDisplayValue('tk_plain_secret_value')
    ).toBeInTheDocument()
    // Admins can copy keys later, so the dialog must not claim "only once".
    expect(shown).not.toHaveTextContent(/only once/i)
    expect(
      within(shown).getByText(/admins can copy the full key later/i)
    ).toBeInTheDocument()
    const done = within(shown).getByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('dialog', { name: 'API key created' })
    ).toBeInTheDocument()
    await user.click(within(shown).getByRole('checkbox'))
    await user.click(done)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sends no expiry for keys that never expire', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({
      data: { apiKey: { id: 'k3', name: 'Web', type: 'CLIENT', key: 'tk_x' } },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'New API key' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Web')
    await user.selectOptions(within(dialog).getByLabelText('Expires'), '')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/api-keys/organization/${ORG_ID}`,
        {
          name: 'Web',
          type: 'CLIENT',
        }
      )
    )
  })

  it('deletes a key after confirmation', async () => {
    const user = userEvent.setup()
    api.delete.mockResolvedValue({ data: { success: true } })
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Delete Web app' })
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete key' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api-keys/k1'))
    await waitFor(() => expect(screen.queryByText('Web app')).toBeNull())
  })

  it('is read-only for viewers', async () => {
    state.role = 'VIEWER'
    state.keys = [{ ...WEB, key: 'tk_aaaa…beef' }]
    renderPage()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
    expect(screen.getByText(/masked/i)).toBeInTheDocument()
  })

  it('shows an empty state and a load error', async () => {
    state.keys = []
    const { unmount } = renderPage()
    expect(await screen.findByText('No API keys yet')).toBeInTheDocument()
    unmount()
    state.keys = new Error('down')
    renderPage()
    expect(
      await screen.findByText('The API keys could not be loaded.')
    ).toBeInTheDocument()
  })

  describe('MCP keys', () => {
    const openCreate = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(
        await screen.findByRole('button', { name: 'New API key' })
      )
      return screen.findByRole('dialog')
    }
    const fillAgent = async (
      user: ReturnType<typeof userEvent.setup>,
      dialog: HTMLElement
    ) => {
      await user.type(within(dialog).getByLabelText('Name'), 'Agent')
      await user.selectOptions(within(dialog).getByLabelText('Project'), 'p1')
      await within(dialog).findByRole('checkbox', { name: /Development/ })
    }
    const created = {
      data: {
        apiKey: { id: 'k9', name: 'Agent', type: 'MCP', key: 'tkm_plain' },
      },
    }

    it('member can open create dialog and only MCP type is offered', async () => {
      state.role = 'MEMBER'
      state.keys = []
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      expect(within(dialog).getAllByRole('radio')).toHaveLength(1)
      expect(within(dialog).getByRole('radio', { name: /MCP/ })).toBeChecked()
    })

    it('admin is offered CLIENT, SERVER and MCP', async () => {
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      expect(within(dialog).getAllByRole('radio')).toHaveLength(3)
    })

    it('MCP requires a project before submit', async () => {
      state.role = 'MEMBER'
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      await user.type(within(dialog).getByLabelText('Name'), 'Agent')
      expect(
        within(dialog).getByRole('button', { name: 'Create' })
      ).toBeDisabled()
      await user.selectOptions(within(dialog).getByLabelText('Project'), 'p1')
      expect(
        within(dialog).getByRole('button', { name: 'Create' })
      ).toBeEnabled()
    })

    it('development environment is preselected', async () => {
      state.role = 'MEMBER'
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      await user.selectOptions(within(dialog).getByLabelText('Project'), 'p1')
      expect(
        await within(dialog).findByRole('checkbox', { name: /Development/ })
      ).toBeChecked()
      expect(
        within(dialog).getByRole('checkbox', { name: /Production/ })
      ).not.toBeChecked()
    })

    it('submits type MCP with projectId and allowedEnvironmentIds', async () => {
      state.role = 'MEMBER'
      api.post.mockResolvedValue(created)
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      await fillAgent(user, dialog)
      await user.click(
        within(dialog).getByRole('checkbox', { name: /Production/ })
      )
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          `/api-keys/organization/${ORG_ID}`,
          {
            name: 'Agent',
            type: 'MCP',
            projectId: 'p1',
            allowedEnvironmentIds: ['env-dev', 'env-prod'],
            expiresInDays: 365,
          }
        )
      )
    })

    it('created MCP key shows the claude mcp add command', async () => {
      state.role = 'MEMBER'
      api.post.mockResolvedValue(created)
      const user = userEvent.setup()
      renderPage()
      const dialog = await openCreate(user)
      await fillAgent(user, dialog)
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))
      const shown = await screen.findByRole('dialog', {
        name: 'API key created',
      })
      expect(
        within(shown).getByDisplayValue(
          `claude mcp add --transport http togglely ${window.location.origin}/api/mcp --header "Authorization: Bearer tkm_plain"`
        )
      ).toBeInTheDocument()
      expect(within(shown).getByText(/shown only once/i)).toBeInTheDocument()
      expect(shown).not.toHaveTextContent(/admins can copy/i)
    })

    it('member sees delete only on own MCP key', async () => {
      state.role = 'MEMBER'
      const mcp = {
        ...WEB,
        type: 'MCP',
        key: 'tkm_aaaa…beef',
        projectId: 'p1',
        allowedEnvironmentIds: ['env-dev'],
      }
      state.keys = [
        { ...mcp, id: 'm1', name: 'Mine', userId: 'u1' },
        { ...mcp, id: 'm2', name: 'Theirs', userId: 'u2' },
        { ...WEB, key: 'tk_aaaa…beef' },
      ]
      renderPage()
      const table = await screen.findByRole('table', { name: 'API keys' })
      expect(
        within(table).getByRole('button', { name: 'Delete Mine' })
      ).toBeInTheDocument()
      expect(
        within(table).queryByRole('button', { name: 'Delete Theirs' })
      ).toBeNull()
      expect(
        within(table).queryByRole('button', { name: 'Delete Web app' })
      ).toBeNull()
      expect(within(table).queryByRole('button', { name: /Copy/ })).toBeNull()
      expect(await within(table).findAllByText(/Shop/)).not.toHaveLength(0)
      expect(
        within(table).getAllByText(/toggles: Development/)
      ).not.toHaveLength(0)
    })
  })
})
