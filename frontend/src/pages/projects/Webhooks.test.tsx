import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT = 'p1'

const mocks = vi.hoisted(() => ({
  role: 'ADMIN' as string,
  webhooks: [] as unknown[],
  listError: null as unknown,
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => 'toast-id'),
  dismiss: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: PROJECT, name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme', role: mocks.role }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import Webhooks from './Webhooks'

const ENVS = [
  { id: 'env-dev', name: 'Development', key: 'development' },
  { id: 'env-prod', name: 'Production', key: 'production' },
]

const hook = (overrides: Record<string, unknown> = {}) => ({
  id: 'w1',
  projectId: PROJECT,
  url: 'https://hooks.example.com/togglely',
  description: 'CDN purge',
  environmentIds: [],
  enabled: true,
  secret: 'whsec_…abcd',
  consecutiveFailures: 0,
  lastDeliveryAt: '2026-11-09T10:00:00.000Z',
  lastStatus: 'success',
  createdAt: '2026-11-09T09:00:00.000Z',
  updatedAt: '2026-11-09T09:00:00.000Z',
  ...overrides,
})

const axiosError = (status: number, data: unknown) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data },
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT}/webhooks`]}>
      <Routes>
        <Route path="/projects/:projectId/webhooks" element={<Webhooks />} />
        <Route path="/projects/:projectId/webhooks/:webhookId" element={<p>detail page</p>} />
      </Routes>
    </MemoryRouter>
  )

describe('Webhooks page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
    vi.clearAllMocks()
    mocks.role = 'ADMIN'
    mocks.webhooks = [hook()]
    mocks.listError = null
    mocks.get.mockImplementation((url: string) => {
      if (url === `/projects/${PROJECT}/webhooks`) {
        return mocks.listError ? Promise.reject(mocks.listError) : Promise.resolve({ data: { webhooks: mocks.webhooks } })
      }
      if (url === `/environments/project/${PROJECT}`) return Promise.resolve({ data: { environments: ENVS } })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  it('lists webhooks with environments and status', async () => {
    mocks.webhooks = [
      hook(),
      hook({
        id: 'w2',
        url: 'https://other.example.com/x',
        description: null,
        environmentIds: ['env-prod'],
        enabled: false,
        lastStatus: 'failed',
        consecutiveFailures: 7,
      }),
    ]
    renderPage()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByRole('link', { name: 'https://hooks.example.com/togglely' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT}/webhooks/w1`
    )
    expect(within(rows[1]).getByText('Alle')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Aktiv')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Zugestellt')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Production')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Inaktiv')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Fehlgeschlagen')).toBeInTheDocument()
    expect(within(rows[2]).getByText('7 Fehlschläge in Folge')).toBeInTheDocument()
  })

  it('explains webhooks in the empty state', async () => {
    mocks.webhooks = []
    renderPage()
    expect(await screen.findByText('Noch keine Webhooks')).toBeInTheDocument()
    expect(screen.getByText(/signierten POST-Request/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Webhook hinzufügen' })).toBeInTheDocument()
  })

  it('creates a webhook and shows the secret exactly once', async () => {
    mocks.webhooks = []
    const created = hook({ id: 'w9', url: 'https://new.example.com/hook', environmentIds: ['env-prod'] })
    mocks.post.mockResolvedValue({ data: { webhook: created, secret: 'whsec_PLAINSECRET123' } })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Webhook hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Endpunkt-URL'), 'https://new.example.com/hook')
    await user.click(within(dialog).getByLabelText('Production'))
    expect(within(dialog).getByLabelText('Alle Environments')).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Webhook hinzufügen' }))

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks`, {
        url: 'https://new.example.com/hook',
        description: undefined,
        environmentIds: ['env-prod'],
        enabled: true,
      })
    )
    const secretDialog = await screen.findByRole('dialog', { name: 'Webhook hinzugefügt' })
    expect(within(secretDialog).getByDisplayValue('whsec_PLAINSECRET123')).toBeInTheDocument()
    expect(within(secretDialog).getByText(/Nur jetzt sichtbar/)).toBeInTheDocument()
    expect(within(secretDialog).getByText('Signatur prüfen (Node.js)')).toBeInTheDocument()
    expect(secretDialog.textContent).toContain('timingSafeEqual')

    await user.click(within(secretDialog).getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(screen.queryByDisplayValue('whsec_PLAINSECRET123')).toBeNull())
    // The list only shows the masked secret
    expect(screen.getByRole('link', { name: 'https://new.example.com/hook' })).toBeInTheDocument()
    expect(screen.queryByText(/PLAINSECRET/)).toBeNull()
  })

  it('maps API error codes to friendly messages in the dialog', async () => {
    mocks.post.mockRejectedValue(axiosError(400, { message: 'URL resolves to a private address', code: 'blocked_private_address' }))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Webhook hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Endpunkt-URL'), 'https://10.0.0.1/hook')
    await user.click(within(dialog).getByRole('button', { name: 'Webhook hinzufügen' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Private oder interne Adressen sind als Webhook-Ziel nicht erlaubt.'
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sends a test event and reports the result as toast', async () => {
    mocks.post.mockResolvedValue({
      data: { delivery: { id: 'd1', status: 'failed', responseCode: null, error: 'connection_failed: ECONNREFUSED' } },
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aktionen für https://hooks.example.com/togglely' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Test senden' }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks/w1/test`))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Test fehlgeschlagen – es wird nicht erneut versucht: Verbindung fehlgeschlagen (ECONNREFUSED)')
    )

    mocks.post.mockResolvedValue({ data: { delivery: { id: 'd2', status: 'success', responseCode: 204, error: null } } })
    await user.click(screen.getByRole('button', { name: 'Aktionen für https://hooks.example.com/togglely' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Test senden' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Test zugestellt (HTTP 204)'))
  })

  it('deletes a webhook only after confirmation', async () => {
    mocks.del.mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aktionen für https://hooks.example.com/togglely' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Löschen' }))
    const confirm = await screen.findByRole('dialog', { name: 'Webhook löschen?' })
    expect(mocks.del).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.del).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Aktionen für https://hooks.example.com/togglely' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Löschen' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks/w1`))
    await waitFor(() => expect(screen.getByText('Noch keine Webhooks')).toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Webhook gelöscht')
  })

  it('toggles a webhook off', async () => {
    mocks.patch.mockResolvedValue({ data: { webhook: hook({ enabled: false }) } })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Aktionen für https://hooks.example.com/togglely' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Deaktivieren' }))
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks/w1`, { enabled: false }))
    expect(await screen.findByText('Inaktiv')).toBeInTheDocument()
  })

  it('is read-only for members', async () => {
    mocks.role = 'MEMBER'
    // Members get masked URLs from the API
    mocks.webhooks = [hook({ url: 'https://hooks.example.com/…' })]
    renderPage()
    expect(await screen.findByRole('link', { name: 'https://hooks.example.com/…' })).toBeInTheDocument()
    expect(screen.getByText(/Nur Lesen/)).toHaveTextContent('Der Pfad der URL ist nur für Admins sichtbar.')
    expect(screen.queryByRole('button', { name: 'Webhook hinzufügen' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Aktionen für/ })).toBeNull()
  })

  it('shows a no-permission state for viewers (403)', async () => {
    mocks.role = 'VIEWER'
    mocks.listError = axiosError(403, { message: 'Forbidden' })
    renderPage()
    expect(await screen.findByText('Kein Zugriff')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('offers a retry when loading fails', async () => {
    mocks.listError = axiosError(500, { message: 'boom' })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Die Webhooks konnten nicht geladen werden.')).toBeInTheDocument()
    mocks.listError = null
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
