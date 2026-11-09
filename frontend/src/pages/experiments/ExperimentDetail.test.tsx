import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { axiosError, experiment, PROJECT, results } from './testFixtures'

const mocks = vi.hoisted(() => ({
  role: 'MEMBER' as string,
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: { get: mocks.get, post: mocks.post, delete: mocks.del } }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: PROJECT, name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme', role: mocks.role }],
    isLoading: false,
    error: null,
  }),
}))

import ExperimentDetail from './ExperimentDetail'

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

const renderPage = (url = `/projects/${PROJECT}/experiments/e1`) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/projects/:projectId/experiments/:id" element={<ExperimentDetail />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const serve = (exp: ReturnType<typeof experiment>, res: unknown = results()) =>
  mocks.get.mockImplementation((url: string) => {
    if (url === '/experiments/e1') return Promise.resolve({ data: exp })
    if (url === '/experiments/e1/results') return Promise.resolve({ data: res })
    return Promise.reject(axiosError(404))
  })

describe('ExperimentDetail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    mocks.role = 'MEMBER'
  })

  it('shows header with status, breadcrumb and the overview tab', async () => {
    serve(experiment())
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Checkout CTA' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Experiments' })).toHaveAttribute('href', `/projects/${PROJECT}/experiments`)
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
    expect(screen.getByText('A green button converts better')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Checkout button/ })).toHaveAttribute(
      'href',
      `/projects/${PROJECT}/flags/f1`
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    // MEMBER may not delete
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('starts a draft', async () => {
    const user = userEvent.setup()
    serve(experiment())
    mocks.post.mockResolvedValue({ data: { ...experiment(), status: 'RUNNING', startedAt: '2026-11-09T10:00:00.000Z' } })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Start' }))
    expect(mocks.post).toHaveBeenCalledWith('/experiments/e1/start')
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument()
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
  })

  it('asks before completing', async () => {
    const user = userEvent.setup()
    serve(experiment({ status: 'RUNNING' }))
    mocks.post.mockResolvedValue({ data: { ...experiment(), status: 'COMPLETED' } })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Complete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Complete experiment?')
    expect(mocks.post).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Complete' }))
    expect(mocks.post).toHaveBeenCalledWith('/experiments/e1/complete')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('offers resume for paused experiments', async () => {
    serve(experiment({ status: 'PAUSED' }))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('hides lifecycle actions for viewers', async () => {
    mocks.role = 'VIEWER'
    serve(experiment({ status: 'RUNNING' }))
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('lets admins delete drafts', async () => {
    const user = userEvent.setup()
    mocks.role = 'ADMIN'
    serve(experiment())
    mocks.del.mockResolvedValue({ data: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mocks.del).toHaveBeenCalledWith('/experiments/e1')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/projects/${PROJECT}/experiments`))
  })

  it('shows variants with the traffic split', async () => {
    const user = userEvent.setup()
    serve(experiment())
    renderPage()
    await user.click(await screen.findByRole('tab', { name: /Variants/ }))
    const table = screen.getByRole('table', { name: 'Variants' })
    expect(within(table).getByText('blue')).toBeInTheDocument()
    expect(within(table).getAllByText('50 %')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Control 50 %, Green 50 %' })).toBeInTheDocument()
    expect(screen.getByText('80 % of users take part')).toBeInTheDocument()
  })

  it('shows results, bars and significance', async () => {
    const user = userEvent.setup()
    serve(experiment({ status: 'RUNNING' }))
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'Results' }))
    expect(await screen.findByText('Green wins with 99.9 % confidence.')).toBeInTheDocument()
    const meters = screen.getAllByRole('meter')
    expect(meters).toHaveLength(2)
    expect(meters[1]).toHaveAttribute('aria-valuetext', '15.00 %')
    const table = screen.getByRole('table', { name: 'Results' })
    expect(within(table).getByText('Winner')).toBeInTheDocument()
    expect(within(table).getByText('+50.0 %')).toBeInTheDocument()
    expect(screen.getByText('2,000')).toBeInTheDocument()
  })

  it('explains missing significance', async () => {
    serve(
      experiment({ status: 'RUNNING' }),
      results({
        isSignificant: false,
        winner: null,
        confidence: 0,
        totalImpressions: 30,
        variants: [
          { key: 'control', name: 'Control', impressions: 20, conversions: 2, conversionRate: 0.1, isControl: true },
          { key: 'green', name: 'Green', impressions: 10, conversions: 1, conversionRate: 0.1, isControl: false },
        ],
      })
    )
    renderPage(`/projects/${PROJECT}/experiments/e1?tab=results`)
    expect(await screen.findByText('No significant winner yet.')).toBeInTheDocument()
    expect(screen.getByText(/at least 30 exposed users/)).toBeInTheDocument()
  })

  it('shows an empty results state for drafts', async () => {
    serve(experiment(), results({ totalImpressions: 0, variants: [] }))
    renderPage(`/projects/${PROJECT}/experiments/e1?tab=results`)
    expect(await screen.findByText('No results yet')).toBeInTheDocument()
    expect(screen.getByText(/Start the experiment to collect/)).toBeInTheDocument()
  })

  it('shows not found', async () => {
    mocks.get.mockRejectedValue(axiosError(404))
    renderPage()
    expect(await screen.findByText('Experiment not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to experiments' })).toBeInTheDocument()
  })

  it('shows a load error with retry', async () => {
    mocks.get.mockRejectedValue(axiosError(500))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('The experiment could not be loaded.')
  })
})
