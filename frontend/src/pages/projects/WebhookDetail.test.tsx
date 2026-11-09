import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT = 'p1'

const mocks = vi.hoisted(() => ({
  role: 'ADMIN' as string,
  get: vi.fn(),
  post: vi.fn(),
}))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(() => 'toast-id'),
  dismiss: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, post: mocks.post, patch: vi.fn(), delete: vi.fn() },
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

import WebhookDetail from './WebhookDetail'

const WEBHOOK = {
  id: 'w1',
  projectId: PROJECT,
  url: 'https://hooks.example.com/togglely',
  description: null,
  environmentIds: ['env-prod'],
  enabled: true,
  secret: 'whsec_…abcd',
  consecutiveFailures: 0,
  lastDeliveryAt: null,
  lastStatus: null,
  createdAt: '2026-11-09T09:00:00.000Z',
  updatedAt: '2026-11-09T09:00:00.000Z',
}

const delivery = (overrides: Record<string, unknown>) => ({
  id: 'd1',
  webhookId: 'w1',
  eventId: 'evt-1',
  type: 'flags.changed',
  status: 'success',
  attempt: 1,
  responseCode: 200,
  responseBody: 'ok',
  error: null,
  durationMs: 42,
  nextAttemptAt: null,
  manual: false,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
  event: { id: 'evt-1', type: 'flags.changed', version: 3, changes: [{ flagKey: 'checkout', action: 'toggled' }] },
  ...overrides,
})

const DELIVERIES = [
  delivery({ id: 'd3', status: 'pending', attempt: 2, responseCode: 500, responseBody: 'oops', error: 'unexpected_status', nextAttemptAt: '2026-11-09T11:00:00.000Z' }),
  delivery({ id: 'd2', status: 'failed', responseCode: null, responseBody: null, error: 'timeout', durationMs: 10000, type: 'webhook.test', manual: true }),
  delivery({ id: 'd1' }),
]

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT}/webhooks/w1`]}>
      <Routes>
        <Route path="/projects/:projectId/webhooks/:webhookId" element={<WebhookDetail />} />
        <Route path="/projects/:projectId/webhooks" element={<p>list page</p>} />
      </Routes>
    </MemoryRouter>
  )

describe('WebhookDetail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
    vi.clearAllMocks()
    mocks.role = 'ADMIN'
    mocks.get.mockImplementation((url: string) => {
      if (url === `/projects/${PROJECT}/webhooks`) return Promise.resolve({ data: { webhooks: [WEBHOOK] } })
      if (url === `/projects/${PROJECT}/webhooks/w1/deliveries`) return Promise.resolve({ data: { deliveries: DELIVERIES } })
      if (url === `/environments/project/${PROJECT}`)
        return Promise.resolve({ data: { environments: [{ id: 'env-prod', name: 'Production', key: 'production' }] } })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  it('renders deliveries with their statuses', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: WEBHOOK.url })).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Ausstehend')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Unerwarteter HTTP-Status')).toBeInTheDocument()
    expect(within(rows[0]).getByText('500')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Fehlgeschlagen')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Zeitüberschreitung (10 s)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('webhook.test')).toBeInTheDocument()
    expect(within(rows[1]).getByText('manuell')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('manuell')).toBeNull()
    expect(within(rows[2]).getByText('Zugestellt')).toBeInTheDocument()
    expect(within(rows[2]).getByText('42 ms')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks/w1/deliveries`, { params: { limit: 50 } })
  })

  it('expands a delivery and sends it again', async () => {
    mocks.post.mockResolvedValue({ data: { delivery: { ...DELIVERIES[0], status: 'success', responseCode: 200 } } })
    const user = userEvent.setup()
    renderPage()
    const toggles = await screen.findAllByRole('button', { name: /Details der Zustellung/ })
    await user.click(toggles[0])
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/"flagKey": "checkout"/)).toBeInTheDocument()
    expect(screen.getByText('oops')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Erneut senden' }))
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(`/projects/${PROJECT}/webhooks/w1/deliveries/d3/redeliver`)
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Erneut zugestellt (HTTP 200)'))
  })

  it('says when a failed redelivery will be retried', async () => {
    mocks.post.mockResolvedValue({
      data: { delivery: { ...DELIVERIES[0], status: 'pending', responseCode: 503, error: 'unexpected_status', manual: true } },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: /Details der Zustellung/ }))[0])
    await user.click(screen.getByRole('button', { name: 'Erneut senden' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Zustellung fehlgeschlagen: Unerwarteter HTTP-Status – ein weiterer Versuch ist geplant'
      )
    )
  })

  it('reports a failed test as not retried', async () => {
    mocks.post.mockResolvedValue({
      data: { delivery: delivery({ id: 'd5', type: 'webhook.test', status: 'failed', responseCode: 500, error: 'unexpected_status', manual: true }) },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Test senden' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Test fehlgeschlagen – es wird nicht erneut versucht: Unerwarteter HTTP-Status'
      )
    )
  })

  it('reports a delivery that is still in flight', async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 409, data: { message: 'busy' } } })
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: /Details der Zustellung/ }))[1])
    await user.click(screen.getByRole('button', { name: 'Erneut senden' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/gerade gesendet/)))
  })

  it('sends a test event from the header', async () => {
    mocks.post.mockResolvedValue({ data: { delivery: delivery({ id: 'd4', type: 'webhook.test', responseCode: 202 }) } })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Test senden' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Test zugestellt (HTTP 202)'))
  })

  it('hides write actions for members', async () => {
    mocks.role = 'MEMBER'
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Der Pfad der URL ist nur für Admins sichtbar.')).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: /Details der Zustellung/ }))[0])
    expect(screen.queryByRole('button', { name: 'Erneut senden' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Test senden' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Aktionen für/ })).toBeNull()
  })

  it('shows not found for unknown webhooks', async () => {
    mocks.get.mockImplementation((url: string) =>
      url.endsWith('/webhooks') ? Promise.resolve({ data: { webhooks: [] } }) : Promise.resolve({ data: { environments: [] } })
    )
    renderPage()
    expect(await screen.findByText('Webhook nicht gefunden')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zurück zu den Webhooks/ })).toHaveAttribute('href', `/projects/${PROJECT}/webhooks`)
  })
})
