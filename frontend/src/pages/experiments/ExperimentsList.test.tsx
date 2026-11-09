import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { axiosError, experiment, PROJECT } from './testFixtures'

const mocks = vi.hoisted(() => ({
  role: 'ADMIN' as string,
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

import ExperimentsList from './ExperimentsList'

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

const renderPage = (url = `/projects/${PROJECT}/experiments`) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/projects/:projectId/experiments" element={<ExperimentsList />} />
        {/* Legacy mount without the route param (ProjectQueryBridge / ?projectId=) */}
        <Route path="/legacy" element={<ExperimentsList />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const LIST = [
  experiment(),
  experiment({
    id: 'e2',
    name: 'Pricing page',
    key: 'pricing',
    status: 'RUNNING',
    startedAt: '2026-11-05T10:00:00.000Z',
    variants: [
      { id: 'a', key: 'control', name: 'Control', value: 'a', weight: 34, isControl: true },
      { id: 'b', key: 'b', name: 'B', value: 'b', weight: 33, isControl: false },
      { id: 'c', key: 'c', name: 'C', value: 'c', weight: 33, isControl: false },
    ],
  }),
]

describe('ExperimentsList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    mocks.role = 'ADMIN'
    mocks.get.mockResolvedValue({ data: LIST })
  })

  it('lists the experiments of the route project in a table', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Experiments' })
    expect(mocks.get).toHaveBeenCalledWith('/experiments', { params: { projectId: PROJECT } })

    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    const running = rows[2]
    expect(within(running).getByRole('link', { name: 'Pricing page' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT}/experiments/e2`
    )
    expect(within(running).getByText('Running')).toBeInTheDocument()
    expect(within(running).getByText('Production')).toBeInTheDocument()
    expect(within(running).getByText('checkout-button')).toBeInTheDocument()
    expect(within(running).getByText('3')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Draft')).toBeInTheDocument()
  })

  it('falls back to ?projectId= when the route has no project', async () => {
    renderPage(`/legacy?projectId=${PROJECT}`)
    await screen.findByRole('table')
    expect(mocks.get).toHaveBeenCalledWith('/experiments', { params: { projectId: PROJECT } })
  })

  it('filters by status chip and search', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: /^Running/ }))
    expect(screen.getByRole('button', { name: /^Running/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Checkout CTA')).not.toBeInTheDocument()
    expect(screen.getByText('Pricing page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^All/ }))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(await screen.findByText('No matching experiments')).toBeInTheDocument()
  })

  it('shows the empty state with a create link', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText('No experiments yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /New experiment/ })).toHaveAttribute(
      'href',
      `/projects/${PROJECT}/experiments/new`
    )
  })

  it('hides create for viewers', async () => {
    mocks.role = 'VIEWER'
    mocks.get.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText('No experiments yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New experiment/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Viewers can see experiments/)).toBeInTheDocument()
  })

  it('shows an error state with retry', async () => {
    const user = userEvent.setup()
    mocks.get.mockRejectedValueOnce(axiosError(500))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('The experiments could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('opens the detail page on row click', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    const row = screen.getByRole('link', { name: 'Checkout CTA' }).closest('tr') as HTMLElement
    await user.click(within(row).getByText('Draft'))
    expect(screen.getByTestId('where')).toHaveTextContent(`/projects/${PROJECT}/experiments/e1`)
  })

  it('starts a draft from the row menu', async () => {
    const user = userEvent.setup()
    mocks.post.mockResolvedValue({ data: { ...LIST[0], status: 'RUNNING', startedAt: '2026-11-09T10:00:00.000Z' } })
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Actions for Checkout CTA' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Start' }))
    expect(mocks.post).toHaveBeenCalledWith('/experiments/e1/start')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Experiment "Checkout CTA" started'))
    const row = screen.getByRole('link', { name: 'Checkout CTA' }).closest('tr') as HTMLElement
    expect(within(row).getByText('Running')).toBeInTheDocument()
  })

  it('deletes a draft after confirmation', async () => {
    const user = userEvent.setup()
    mocks.del.mockResolvedValue({ data: null })
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Actions for Checkout CTA' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete experiment?')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mocks.del).toHaveBeenCalledWith('/experiments/e1')
    await waitFor(() => expect(screen.queryByText('Checkout CTA')).not.toBeInTheDocument())
  })

  it('offers no delete for running experiments', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Actions for Pricing page' }))
    expect(await screen.findByRole('menuitem', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Complete' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
