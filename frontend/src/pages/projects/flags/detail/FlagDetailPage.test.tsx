import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT = 'p1'
const FLAG = '64b000000000000000000001'
const ENV_DEV = '64b0000000000000000000d1'
const ENV_PROD = '64b0000000000000000000f1'

const mocks = vi.hoisted(() => ({
  projectType: 'SINGLE' as 'SINGLE' | 'MULTI',
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/lib/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
  },
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [
      {
        id: PROJECT,
        name: 'Shop',
        key: 'shop',
        type: mocks.projectType,
        organizationId: 'o1',
      },
    ],
    organizations: [{ id: 'o1', name: 'Acme', role: 'ADMIN' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import FlagDetailPage from './FlagDetailPage'

const flag = (overrides: Record<string, unknown> = {}) => ({
  id: FLAG,
  key: 'new-checkout',
  name: 'New checkout',
  description: 'Rolls out the new checkout',
  flagType: 'BOOLEAN',
  projectId: PROJECT,
  ...overrides,
})

const envs = () => [
  { id: ENV_DEV, name: 'Development', enabled: true, defaultValue: 'true' },
  { id: ENV_PROD, name: 'Production', enabled: false, defaultValue: 'false' },
]

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  environmentId: ENV_DEV,
  brandId: null,
  name: 'German users',
  operator: 'AND',
  serveValue: 'true',
  priority: 0,
  isDefault: false,
  enabled: true,
  conditions: [
    { id: 'c1', attribute: 'country', operator: 'EQUALS', value: 'DE' },
  ],
  createdAt: '2026-11-09T09:00:00.000Z',
  updatedAt: '2026-11-09T09:00:00.000Z',
  ...overrides,
})

const axiosError = (
  status: number,
  message = `Request failed with status code ${status}`
) => ({
  isAxiosError: true,
  message,
  response: { status, data: { message } },
})

const state = {
  flag: flag() as Record<string, unknown>,
  flagError: null as unknown,
  rules: [] as unknown[],
  auditLogs: [] as unknown[],
  flagsWithBrands: [] as unknown[],
}

function LocationDisplay() {
  const location = useLocation()
  return (
    <p data-testid="location">{`${location.pathname}${location.search}`}</p>
  )
}

const renderPage = (search = '') =>
  render(
    <MemoryRouter
      initialEntries={[`/projects/${PROJECT}/flags/${FLAG}${search}`]}
    >
      <Routes>
        <Route
          path="/projects/:projectId/flags/:flagId"
          element={<FlagDetailPage />}
        />
        <Route path="/projects/:projectId/flags" element={<p>flags list</p>} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  )

describe('Flag detail page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    mocks.projectType = 'SINGLE'
    state.flag = flag()
    state.flagError = null
    state.rules = []
    state.auditLogs = []
    state.flagsWithBrands = []
    mocks.get.mockImplementation((url: string) => {
      if (url === `/feature-flags/${FLAG}`) {
        return state.flagError
          ? Promise.reject(state.flagError)
          : Promise.resolve({ data: { featureFlag: state.flag } })
      }
      if (url === `/feature-flags/${FLAG}/environments`)
        return Promise.resolve({ data: { environments: envs() } })
      if (url === `/feature-flags/${FLAG}/targeting-rules`)
        return Promise.resolve({ data: { rules: state.rules } })
      if (url === `/audit-logs/project/${PROJECT}`)
        return Promise.resolve({ data: { auditLogs: state.auditLogs } })
      if (url === `/projects/${PROJECT}/flags-with-brands`) {
        return Promise.resolve({ data: { flags: state.flagsWithBrands } })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    mocks.patch.mockResolvedValue({ data: {} })
    mocks.post.mockResolvedValue({ data: {} })
    mocks.del.mockResolvedValue({ data: {} })
  })

  it('shows the header with name, key, type and the environment values', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New checkout' })
    ).toBeInTheDocument()
    expect(screen.getByText('new-checkout')).toBeInTheDocument()
    expect(screen.getByText('BOOLEAN')).toBeInTheDocument()
    expect(screen.getByText('Rolls out the new checkout')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Feature flags' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT}/flags`
    )
    expect(
      screen.getByRole('switch', { name: 'Development enabled' })
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Production enabled' })
    ).not.toBeChecked()
    // SINGLE projects have no brands tab
    expect(
      screen.queryByRole('tab', { name: 'Brands' })
    ).not.toBeInTheDocument()
  })

  it('toggles an environment', async () => {
    const user = userEvent.setup()
    renderPage()
    const prod = await screen.findByRole('switch', {
      name: 'Production enabled',
    })
    await user.click(prod)
    expect(mocks.patch).toHaveBeenCalledWith(
      `/feature-flags/${FLAG}/environments/${ENV_PROD}`,
      { isEnabled: true }
    )
    await waitFor(() => expect(prod).toBeChecked())
  })

  it('shows a toast and keeps the state when an environment toggle fails', async () => {
    mocks.patch.mockRejectedValueOnce(axiosError(403, 'Forbidden resource'))
    const user = userEvent.setup()
    renderPage()
    const dev = await screen.findByRole('switch', {
      name: 'Development enabled',
    })
    await user.click(dev)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Forbidden resource')
    )
    expect(dev).toBeChecked()
  })

  it('edits a string value per environment', async () => {
    state.flag = flag({ flagType: 'STRING' })
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Edit value of Production' })
    )
    const input = await screen.findByLabelText('Value (STRING)')
    await user.clear(input)
    await user.type(input, 'blue')
    await user.click(screen.getByRole('button', { name: 'Save value' }))
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        `/feature-flags/${FLAG}/environments/${ENV_PROD}/value`,
        {
          value: 'blue',
        }
      )
    )
    expect(await screen.findByTitle('blue')).toBeInTheDocument()
  })

  it('reads the tab from the URL and writes it back on change', async () => {
    const user = userEvent.setup()
    renderPage('?tab=targeting')
    expect(
      await screen.findByRole('tab', { name: 'Targeting' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No targeting rules')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/projects/${PROJECT}/flags/${FLAG}?tab=history`
    )
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    await user.click(screen.getByRole('tab', { name: 'Environments' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      new RegExp(`/flags/${FLAG}$`)
    )
  })

  it('falls back to the environments tab for unknown tabs and brands on SINGLE projects', async () => {
    renderPage('?tab=brands')
    expect(
      await screen.findByRole('tab', { name: 'Environments' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('lists only the history entries of this flag', async () => {
    state.auditLogs = [
      {
        id: 'l1',
        action: 'flag.created',
        entityType: 'FeatureFlag',
        entityId: FLAG,
        newValues: { key: 'new-checkout', name: 'New checkout' },
        createdAt: '2026-11-09T09:00:00.000Z',
        user: {
          id: 'u1',
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      },
      {
        id: 'l2',
        action: 'flag.created',
        entityType: 'FeatureFlag',
        entityId: '64b0000000000000000000ff',
        newValues: { key: 'other-flag' },
        createdAt: '2026-11-09T08:00:00.000Z',
        user: null,
      },
    ]
    renderPage('?tab=history')
    const table = await screen.findByRole('table', { name: 'History' })
    await waitFor(() =>
      expect(within(table).getAllByRole('row')).toHaveLength(2)
    )
    const row = within(table).getAllByRole('row')[1]
    expect(within(row).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(row).getByText('flag.created')).toBeInTheDocument()
    expect(
      within(row).getByText('key: new-checkout, name: New checkout')
    ).toBeInTheDocument()
    expect(screen.queryByText(/other-flag/)).not.toBeInTheDocument()
    // The backend narrows the entries to the flag
    expect(mocks.get).toHaveBeenCalledWith(`/audit-logs/project/${PROJECT}`, {
      params: { entityId: FLAG, limit: 200 },
    })
  })

  it('shows an empty history', async () => {
    renderPage('?tab=history')
    expect(await screen.findByText('No entries yet')).toBeInTheDocument()
  })

  it('shows a history load error with retry', async () => {
    let fail = true
    const base = mocks.get.getMockImplementation()
    mocks.get.mockImplementation((url: string, config?: unknown) => {
      if (url === `/audit-logs/project/${PROJECT}` && fail)
        return Promise.reject(axiosError(500, 'boom'))
      return base?.(url, config)
    })
    const user = userEvent.setup()
    renderPage('?tab=history')
    expect(
      await screen.findByText('The history could not be loaded.')
    ).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No entries yet')).toBeInTheDocument()
  })

  describe('targeting', () => {
    it('lists rules of the selected environment', async () => {
      state.rules = [rule()]
      renderPage('?tab=targeting')
      expect(await screen.findByText('German users')).toBeInTheDocument()
      expect(screen.getByText('country EQUALS DE')).toBeInTheDocument()
      expect(mocks.get).toHaveBeenCalledWith(
        `/feature-flags/${FLAG}/targeting-rules`,
        {
          params: { environmentId: ENV_DEV },
        }
      )
    })

    it('creates a rule', async () => {
      mocks.post.mockResolvedValue({
        data: { rule: rule({ id: 'r2', name: 'Beta' }) },
      })
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await screen.findByText('No targeting rules')
      await user.selectOptions(screen.getByLabelText('Environment'), ENV_PROD)
      await user.click(screen.getByRole('button', { name: 'Add rule' }))
      await user.type(screen.getByLabelText(/Rule name/), 'Beta')
      await user.type(screen.getByLabelText('Condition 1 attribute'), 'country')
      await user.selectOptions(
        screen.getByLabelText('Condition 1 operator'),
        'IN'
      )
      await user.type(screen.getByLabelText('Condition 1 value'), 'DE, AT')
      await user.selectOptions(
        screen.getByLabelText('Serve value (BOOLEAN)'),
        'false'
      )
      const form = screen
        .getByLabelText('Condition 1 value')
        .closest('form') as HTMLFormElement
      await user.click(within(form).getByRole('button', { name: 'Add rule' }))

      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith(
          `/feature-flags/${FLAG}/targeting-rules`,
          {
            environmentId: ENV_PROD,
            name: 'Beta',
            operator: 'AND',
            serveValue: 'false',
            priority: 0,
            enabled: true,
            conditions: [
              { attribute: 'country', operator: 'IN', value: 'DE,AT' },
            ],
          }
        )
      )
      expect(await screen.findByText('Beta')).toBeInTheDocument()
      expect(toast.success).toHaveBeenCalledWith('Targeting rule created')
    })

    it('shows a server error in the rule form', async () => {
      mocks.post.mockRejectedValue(axiosError(400, 'Invalid regex'))
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await screen.findByText('No targeting rules')
      await user.click(screen.getByRole('button', { name: 'Add rule' }))
      await user.type(screen.getByLabelText('Condition 1 attribute'), 'email')
      await user.type(screen.getByLabelText('Condition 1 value'), 'x')
      const form = screen
        .getByLabelText('Condition 1 value')
        .closest('form') as HTMLFormElement
      await user.click(within(form).getByRole('button', { name: 'Add rule' }))
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Invalid regex'
      )
    })

    it('toggles a rule', async () => {
      state.rules = [rule()]
      mocks.patch.mockResolvedValue({
        data: { rule: rule({ enabled: false }) },
      })
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      const toggle = await screen.findByRole('switch', {
        name: 'Rule "German users" enabled',
      })
      await user.click(toggle)
      expect(mocks.patch).toHaveBeenCalledWith(
        `/feature-flags/${FLAG}/targeting-rules/r1`,
        { enabled: false }
      )
      expect(await screen.findByText('Inactive')).toBeInTheDocument()
    })

    it('deletes a rule after confirmation', async () => {
      state.rules = [rule()]
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', {
          name: 'Delete rule "German users"',
        })
      )
      const dialog = await screen.findByRole('dialog')
      expect(mocks.del).not.toHaveBeenCalled()
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
      await waitFor(() =>
        expect(mocks.del).toHaveBeenCalledWith(
          `/feature-flags/${FLAG}/targeting-rules/r1`
        )
      )
      await waitFor(() =>
        expect(screen.queryByText('German users')).not.toBeInTheDocument()
      )
      expect(screen.getByText('No targeting rules')).toBeInTheDocument()
    })

    it('shows a load error for rules with retry', async () => {
      let fail = true
      const base = mocks.get.getMockImplementation()
      mocks.get.mockImplementation((url: string, config?: unknown) => {
        if (url === `/feature-flags/${FLAG}/targeting-rules` && fail)
          return Promise.reject(axiosError(500, 'down'))
        return base?.(url, config)
      })
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      expect(
        await screen.findByText('The targeting rules could not be loaded.')
      ).toBeInTheDocument()
      fail = false
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('No targeting rules')).toBeInTheDocument()
    })
  })

  describe('header actions', () => {
    it('edits name and description', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      const dialog = await screen.findByRole('dialog')
      const name = within(dialog).getByLabelText('Name')
      await user.clear(name)
      await user.type(name, 'Checkout v2')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(mocks.patch).toHaveBeenCalledWith(`/feature-flags/${FLAG}`, {
          name: 'Checkout v2',
          description: 'Rolls out the new checkout',
        })
      )
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Checkout v2' })
      ).toBeInTheDocument()
    })

    it('deletes the flag after confirmation and returns to the list', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Delete' }))
      const dialog = await screen.findByRole('dialog')
      expect(
        within(dialog).getByText(/"New checkout" \(new-checkout\)/)
      ).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
      await waitFor(() =>
        expect(mocks.del).toHaveBeenCalledWith(`/feature-flags/${FLAG}`)
      )
      expect(await screen.findByText('flags list')).toBeInTheDocument()
    })

    it('copies the key', async () => {
      const writeText = vi.fn(() => Promise.resolve())
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      })
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Copy key' }))
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Key copied')
      )
    })
  })

  describe('load states', () => {
    it('shows a load error and retries', async () => {
      state.flagError = axiosError(500, 'Internal server error')
      const user = userEvent.setup()
      renderPage()
      expect(
        await screen.findByText('The feature flag could not be loaded.')
      ).toBeInTheDocument()
      expect(screen.getByText('Internal server error')).toBeInTheDocument()
      state.flagError = null
      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(
        await screen.findByRole('heading', { level: 1, name: 'New checkout' })
      ).toBeInTheDocument()
    })

    it('shows not found for a missing flag', async () => {
      state.flagError = axiosError(404, 'Flag not found')
      renderPage()
      expect(
        await screen.findByText('Feature flag not found')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Back to feature flags' })
      ).toHaveAttribute('href', `/projects/${PROJECT}/flags`)
    })

    it('shows not found for an invalid id without calling the API', async () => {
      render(
        <MemoryRouter initialEntries={[`/projects/${PROJECT}/flags/not-an-id`]}>
          <Routes>
            <Route
              path="/projects/:projectId/flags/:flagId"
              element={<FlagDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      )
      expect(
        await screen.findByText('Feature flag not found')
      ).toBeInTheDocument()
      expect(mocks.get).not.toHaveBeenCalled()
    })
  })

  describe('MULTI projects', () => {
    const multiFlag = () => ({
      id: FLAG,
      environments: [
        {
          id: 'fe1',
          environmentId: ENV_DEV,
          environmentName: 'Development',
          enabled: true,
          defaultValue: 'red',
          brandValues: [
            {
              brandId: 'b1',
              brandName: 'Acme',
              enabled: true,
              defaultValue: 'red',
              inherited: true,
            },
            {
              brandId: 'b2',
              brandName: 'Globex',
              enabled: false,
              defaultValue: 'blue',
              inherited: false,
            },
          ],
        },
      ],
    })

    beforeEach(() => {
      mocks.projectType = 'MULTI'
      state.flag = flag({ flagType: 'STRING' })
      state.flagsWithBrands = [multiFlag()]
    })

    it('shows default and brand values per environment and relinks a brand', async () => {
      const user = userEvent.setup()
      renderPage()
      const card = await screen.findByTestId(`env-card-${ENV_DEV}`)
      expect(within(card).getByText('Default (all brands)')).toBeInTheDocument()
      expect(within(card).getByText('Acme')).toBeInTheDocument()
      expect(within(card).getByText('Globex')).toBeInTheDocument()
      const rows = within(card).getAllByTestId('flag-value-row')
      expect(rows[1]).toHaveAttribute('data-linked', 'true')
      expect(rows[2]).toHaveAttribute('data-linked', 'false')

      await user.click(within(rows[2]).getByRole('button', { pressed: false }))
      await waitFor(() =>
        expect(mocks.del).toHaveBeenCalledWith(
          `/brands/b2/flags/${FLAG}/environments/${ENV_DEV}`
        )
      )
      expect(toast.success).toHaveBeenCalled()
    })

    it('toggles a brand', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(
        await screen.findByRole('switch', {
          name: 'Development Globex enabled',
        })
      )
      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith(
          `/brands/b2/flags/${FLAG}/toggle`,
          {
            environmentId: ENV_DEV,
            enabled: true,
          }
        )
      )
    })

    it('shows the brand × environment overview', async () => {
      renderPage('?tab=brands')
      expect(
        await screen.findByRole('tab', { name: 'Brands' })
      ).toHaveAttribute('aria-selected', 'true')
      const table = await screen.findByRole('table', {
        name: 'Brands × environments',
      })
      await waitFor(() =>
        expect(within(table).getAllByRole('row')).toHaveLength(3)
      )
      expect(
        within(table).getByRole('columnheader', { name: 'Development' })
      ).toBeInTheDocument()
      const [, acme, globex] = within(table).getAllByRole('row')
      expect(within(acme).getByRole('link', { name: 'Acme' })).toHaveAttribute(
        'href',
        `/projects/${PROJECT}/brands/b1`
      )
      expect(within(acme).getByText('on')).toBeInTheDocument()
      expect(within(globex).getByText('off')).toBeInTheDocument()
      expect(within(globex).getByText('blue')).toBeInTheDocument()
    })
  })
})
