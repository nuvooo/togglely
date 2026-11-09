import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = '0123456789abcdef01234567'

const state = vi.hoisted(() => ({
  flags: [] as unknown[],
  environments: undefined as unknown[] | undefined,
  fail: false,
}))

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/lib/axios', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import FlagsPage from './FlagsPage'

const env = (id: string, name: string, enabled: boolean, value: string) => ({
  id: `fe-${id}`,
  environmentId: id,
  environmentName: name,
  enabled,
  defaultValue: value,
})

const FLAGS = [
  {
    id: 'f1',
    name: 'Checkout',
    key: 'new-checkout',
    flagType: 'BOOLEAN',
    // Deliberately not in column order: the project's order wins
    environments: [
      env('prod', 'Production', true, 'true'),
      env('dev', 'Development', false, 'false'),
    ],
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'f2',
    name: 'Banner text',
    key: 'banner',
    flagType: 'STRING',
    environments: [
      env('dev', 'Development', true, 'hello'),
      env('prod', 'Production', false, 'bye'),
    ],
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
]

function Location() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderPage(path = `/projects/${PROJECT_ID}/flags`, Page = FlagsPage) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/projects/:projectId/flags"
          element={
            <>
              <Page />
              <Location />
            </>
          }
        />
        <Route
          path="/projects/:projectId/flags/:flagId"
          element={<Location />}
        />
      </Routes>
    </MemoryRouter>
  )
}

const bodyRows = () =>
  screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0)

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  state.flags = FLAGS
  state.environments = [
    { id: 'dev', name: 'Development', key: 'development' },
    { id: 'staging', name: 'Staging', key: 'staging' },
    { id: 'prod', name: 'Production', key: 'production' },
  ]
  state.fail = false
  api.get.mockImplementation((url: string) => {
    if (state.fail) return Promise.reject(new Error('down'))
    return Promise.resolve({
      data:
        url === `/projects/${PROJECT_ID}`
          ? {
              project: {
                id: PROJECT_ID,
                name: 'Shop',
                key: 'shop',
                type: 'SINGLE',
                organizationId: 'o1',
                environments: state.environments,
              },
            }
          : { featureFlags: state.flags },
    })
  })
})

describe('FlagsPage (single)', () => {
  it('opens the create-flag dialog for ?new=1 and removes the param', async () => {
    state.flags = []
    renderPage(`/projects/${PROJECT_ID}/flags?new=1`)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Flag Name')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).not.toContain('new=1')
    )
  })

  it('creates a flag with a derived key', async () => {
    state.flags = []
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'New flag' })
    )
    await userEvent.type(screen.getByLabelText('Flag Name'), 'Dark Mode')
    expect(screen.getByLabelText('Flag Key')).toHaveValue('dark-mode')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'NUMBER')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/feature-flags/project/${PROJECT_ID}`,
        expect.objectContaining({
          name: 'Dark Mode',
          key: 'dark-mode',
          type: 'NUMBER',
          // Every project environment gets the type's initial value
          initialValues: {
            development: { enabled: false, value: '0' },
            staging: { enabled: false, value: '0' },
            production: { enabled: false, value: '0' },
          },
        })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('shows one switch column per environment in API order', async () => {
    renderPage()
    await screen.findByText('Checkout')

    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual([
      'Name',
      'Type',
      'Development',
      'Staging',
      'Production',
      'Updated',
      'Actions',
    ])

    const [checkout] = bodyRows()
    const switches = within(checkout).getAllByRole('switch')
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Checkout enabled in Development',
      'Checkout enabled in Production',
    ])
    expect(switches[0]).not.toBeChecked()
    expect(switches[1]).toBeChecked()
    // Staging has no value for this flag
    expect(within(checkout).getByText('–')).toBeInTheDocument()
    expect(within(checkout).getByText('new-checkout')).toBeInTheDocument()
    expect(within(checkout).getByText('BOOLEAN')).toBeInTheDocument()
    expect(within(checkout).getByText('2 hours ago')).toBeInTheDocument()
  })

  it('falls back to createdAt and shows "–" without any timestamp', async () => {
    // Shape of GET /feature-flags/project/:id: ISO strings, possibly missing
    state.environments = [{ id: 'dev', name: 'Development', key: 'development' }]
    state.flags = [
      {
        id: 'f1',
        name: 'Created only',
        key: 'created-only',
        description: null,
        flagType: 'BOOLEAN',
        projectId: PROJECT_ID,
        environments: [env('dev', 'Development', false, 'false')],
        createdAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
      },
      {
        id: 'f2',
        name: 'No dates',
        key: 'no-dates',
        description: null,
        flagType: 'BOOLEAN',
        projectId: PROJECT_ID,
        environments: [env('dev', 'Development', false, 'false')],
      },
    ]
    renderPage()
    await screen.findByText('Created only')

    const [created, none] = bodyRows()
    expect(within(created).getByText('3 days ago')).toBeInTheDocument()
    const cells = within(none).getAllByRole('cell')
    expect(cells[cells.length - 2]).toHaveTextContent('–')
  })

  it('derives the columns from the flags without project environments', async () => {
    state.environments = undefined
    renderPage()
    await screen.findByText('Checkout')

    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers.slice(2, 4)).toEqual(['Production', 'Development'])
  })

  it('toggles an environment via the default endpoint', async () => {
    renderPage()

    await userEvent.click(
      await screen.findByRole('switch', {
        name: 'Checkout enabled in Development',
      })
    )

    expect(api.post).toHaveBeenCalledWith('/feature-flags/f1/toggle', {
      environmentId: 'dev',
      enabled: true,
    })
    expect(screen.getByTestId('location').textContent).toBe(
      `/projects/${PROJECT_ID}/flags`
    )
  })

  it('edits a non-boolean value from the value chip', async () => {
    renderPage()

    const chip = await screen.findByRole('button', {
      name: 'Edit value of Banner text in Production',
    })
    expect(chip).toHaveTextContent('bye')
    await userEvent.click(chip)
    const input = await screen.findByLabelText('Value (STRING)')
    expect(input).toHaveValue('bye')
    await userEvent.clear(input)
    await userEvent.type(input, 'ciao')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/feature-flags/f2/environments/prod/value',
        { value: 'ciao' }
      )
    )
  })

  it('opens the flag detail on row click', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('banner'))

    expect(screen.getByTestId('location').textContent).toBe(
      `/projects/${PROJECT_ID}/flags/f2`
    )
  })

  it('filters by name or key', async () => {
    renderPage()
    await screen.findByText('Checkout')

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search by name or key …' }),
      'BANNER'
    )

    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(screen.getByText('Banner text')).toBeInTheDocument()
    expect(screen.queryByText('Checkout')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'nothing-like-this')
    expect(await screen.findByText('No matching flags')).toBeInTheDocument()
  })

  it('filters by enabled in the last environment and by type', async () => {
    renderPage()
    await screen.findByText('Checkout')

    const enabled = screen.getByRole('button', {
      name: 'Enabled in Production 1',
    })
    await userEvent.click(enabled)
    expect(enabled).toHaveAttribute('aria-pressed', 'true')
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('Checkout')).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toContain(
      'filter=enabled'
    )

    await userEvent.click(screen.getByRole('button', { name: 'STRING 1' }))
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('Banner text')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All 2' }))
    expect(bodyRows()).toHaveLength(2)
  })

  it('deletes a flag after confirmation', async () => {
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete flag Checkout' })
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete Checkout in all environments?')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' })
    )

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/feature-flags/f1')
    )
    await waitFor(() =>
      expect(screen.queryByText('Checkout')).not.toBeInTheDocument()
    )
    expect(toast.success).toHaveBeenCalledWith('Flag Checkout deleted')
  })

  it('shows the empty state without flags', async () => {
    state.flags = []
    renderPage()

    expect(await screen.findByText('No feature flags yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New flag' })).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    state.fail = true
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The feature flags could not be loaded.'
    )
    state.fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Checkout')).toBeInTheDocument()
  })
})
