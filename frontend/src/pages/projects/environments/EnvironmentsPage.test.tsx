import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = '0123456789abcdef01234567'
const ORG_ID = 'org-1'

const DEV = { id: 'env-dev', name: 'Development', key: 'development' }
const PROD = { id: 'env-prod', name: 'Production', key: 'production' }
const STAGE = { id: 'env-stage', name: 'Staging', key: 'staging' }

const state = vi.hoisted(() => ({
  envs: [] as unknown[],
  flags: [] as unknown[] | Error,
  role: 'ADMIN',
}))

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [
      {
        id: PROJECT_ID,
        name: 'Shop',
        key: 'shop',
        type: 'SINGLE',
        organizationId: ORG_ID,
      },
    ],
    organizations: [{ id: ORG_ID, name: 'Acme', role: state.role }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import EnvironmentsPage from './EnvironmentsPage'

/** Flags with the given enabled environments. */
const flag = (...enabledIn: string[]) => ({
  environments: [DEV, PROD, STAGE].map((e) => ({
    environmentId: e.id,
    enabled: enabledIn.includes(e.id),
  })),
})

function mockGets() {
  api.get.mockImplementation((url: string) => {
    if (url === `/environments/project/${PROJECT_ID}`) {
      return Promise.resolve({ data: { environments: state.envs } })
    }
    if (url === `/feature-flags/project/${PROJECT_ID}`) {
      return state.flags instanceof Error
        ? Promise.reject(state.flags)
        : Promise.resolve({ data: { featureFlags: state.flags } })
    }
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/environments`]}>
      <Routes>
        <Route
          path="/projects/:projectId/environments"
          element={<EnvironmentsPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

/** Environment names in their rendered order. */
function renderedOrder() {
  return screen
    .getAllByTestId('environment-row')
    .map((row) => row.getAttribute('data-environment-name'))
}

const rowOf = (name: string) =>
  screen
    .getByText(name, { selector: '[data-testid="environment-row"]' })
    .closest('tr') as HTMLElement

const envGets = () =>
  api.get.mock.calls.filter(
    ([url]) => url === `/environments/project/${PROJECT_ID}`
  ).length

describe('EnvironmentsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    state.envs = [DEV, PROD, STAGE]
    state.flags = []
    state.role = 'ADMIN'
    mockGets()
  })

  it('renders environments in the order the API returns', async () => {
    state.envs = [PROD, STAGE, DEV]
    renderPage()
    await screen.findByRole('button', { name: 'Move Production down' })
    expect(renderedOrder()).toEqual(['Production', 'Staging', 'Development'])
    expect(
      screen.getByRole('heading', { level: 1, name: 'Environments' })
    ).toBeInTheDocument()
  })

  it('moves an environment with labelled buttons and sends the new id order', async () => {
    api.post.mockResolvedValue({ data: { environments: [PROD, DEV, STAGE] } })
    renderPage()
    const up = await screen.findByRole('button', { name: 'Move Production up' })
    expect(
      screen.getByRole('button', { name: 'Move Development up' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move Staging down' })
    ).toBeDisabled()

    await userEvent.click(up)

    expect(api.post).toHaveBeenCalledWith(
      `/environments/project/${PROJECT_ID}/reorder`,
      {
        environmentIds: ['env-prod', 'env-dev', 'env-stage'],
      }
    )
    expect(renderedOrder()).toEqual(['Production', 'Development', 'Staging'])
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('can be operated with the keyboard', async () => {
    api.post.mockResolvedValue({ data: { environments: [DEV, STAGE, PROD] } })
    renderPage()
    const down = await screen.findByRole('button', {
      name: 'Move Production down',
    })
    down.focus()
    await userEvent.keyboard('{Enter}')

    expect(api.post).toHaveBeenCalledWith(
      `/environments/project/${PROJECT_ID}/reorder`,
      {
        environmentIds: ['env-dev', 'env-stage', 'env-prod'],
      }
    )
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Development', 'Staging', 'Production'])
    )
  })

  it('refetches the persisted order and shows a toast when saving fails', async () => {
    api.post.mockRejectedValue({
      response: {
        data: { message: 'environmentIds must list every environment' },
      },
    })
    renderPage()
    const up = await screen.findByRole('button', { name: 'Move Staging up' })
    expect(envGets()).toBe(1)
    // The server meanwhile has another order (e.g. changed in another tab)
    state.envs = [STAGE, DEV, PROD]

    await userEvent.click(up)

    await waitFor(() => expect(envGets()).toBe(2))
    expect(toast.error).toHaveBeenCalledWith(
      'environmentIds must list every environment'
    )
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Staging', 'Development', 'Production'])
    )
  })

  it('falls back to the previous order when the refetch fails too', async () => {
    api.post.mockRejectedValue(new Error('offline'))
    renderPage()
    const up = await screen.findByRole('button', { name: 'Move Production up' })
    api.get.mockImplementation(() => Promise.reject(new Error('offline')))

    await userEvent.click(up)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The order could not be saved.')
    )
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Development', 'Production', 'Staging'])
    )
  })

  it('shows active/total flag counts per environment from the flag list', async () => {
    state.flags = [flag('env-dev', 'env-prod'), flag('env-dev'), flag()]
    renderPage()
    await screen.findByRole('button', { name: 'Move Production up' })
    await waitFor(() =>
      expect(
        within(rowOf('Development')).getByText('2 / 3')
      ).toBeInTheDocument()
    )
    expect(within(rowOf('Production')).getByText('1 / 3')).toBeInTheDocument()
    expect(within(rowOf('Staging')).getByText('0 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it('keeps the flag counts when refetching the order after an error', async () => {
    state.flags = [flag('env-prod'), flag('env-prod', 'env-dev')]
    api.post.mockRejectedValue({ response: { data: { message: 'boom' } } })
    renderPage()
    const up = await screen.findByRole('button', { name: 'Move Production up' })
    await waitFor(() =>
      expect(within(rowOf('Production')).getByText('2 / 2')).toBeInTheDocument()
    )
    state.envs = [PROD, DEV, STAGE]

    await userEvent.click(up)

    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Production', 'Development', 'Staging'])
    )
    expect(within(rowOf('Production')).getByText('2 / 2')).toBeInTheDocument()
    expect(within(rowOf('Development')).getByText('1 / 2')).toBeInTheDocument()
  })

  it('shows a dash instead of "undefined" when the counts are unavailable', async () => {
    state.flags = new Error('forbidden')
    renderPage()
    await screen.findByRole('button', { name: 'Move Production up' })
    await waitFor(() =>
      expect(within(rowOf('Production')).getByText('–')).toBeInTheDocument()
    )
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it('creates an environment with a key derived from the name', async () => {
    const created = { id: 'env-qa', name: 'QA Tests', key: 'qa-tests' }
    api.post.mockResolvedValue({ data: { environment: created } })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add environment' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'QA Tests')
    expect(within(dialog).getByLabelText('Key')).toHaveValue('qa-tests')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add environment' })
    )

    expect(api.post).toHaveBeenCalledWith('/environments', {
      name: 'QA Tests',
      key: 'qa-tests',
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
    })
    await waitFor(() =>
      expect(renderedOrder()).toEqual([
        'Development',
        'Production',
        'Staging',
        'QA Tests',
      ])
    )
    expect(toast.success).toHaveBeenCalledWith('Environment added')
  })

  it('renames an environment from the row menu', async () => {
    api.patch.mockResolvedValue({
      data: { environment: { ...PROD, name: 'Live' } },
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Production' })
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Rename' })
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Key')).not.toBeInTheDocument()
    const input = within(dialog).getByLabelText('Name')
    await userEvent.clear(input)
    await userEvent.type(input, 'Live')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(api.patch).toHaveBeenCalledWith('/environments/env-prod', {
      name: 'Live',
    })
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Development', 'Live', 'Staging'])
    )
  })

  it('deletes an environment after confirmation', async () => {
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Staging' })
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' })
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/Staging and all flag values/)
    ).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' })
    )

    expect(api.delete).toHaveBeenCalledWith('/environments/env-stage')
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Development', 'Production'])
    )
  })

  it('is read-only for members', async () => {
    state.role = 'MEMBER'
    renderPage()
    await screen.findByText('Production', {
      selector: '[data-testid="environment-row"]',
    })
    expect(
      screen.queryByRole('button', { name: /Move .* up/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add environment' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Actions for/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Read only/)).toBeInTheDocument()
  })

  it('shows an error state with retry when loading fails', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('down')))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The environments could not be loaded.'
    )
    mockGets()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('button', { name: 'Move Production up' })
  })
})
