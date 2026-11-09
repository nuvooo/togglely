import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = '0123456789abcdef01234567'
const BRAND_ID = 'brand-a'

const state = vi.hoisted(() => ({ flags: [] as unknown[] }))

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

import BrandDetailPage from './BrandDetailPage'

function brandFlags() {
  return [
    {
      id: 'flag-1',
      name: 'Banner',
      key: 'banner',
      description: null,
      flagType: 'BOOLEAN',
      environments: [
        {
          id: 'fe-1',
          environmentId: 'env-1',
          environmentName: 'Development',
          enabled: true,
          defaultValue: 'true',
          inherited: true,
          isBrandSpecific: false,
          default: { enabled: true, defaultValue: 'true' },
        },
        {
          id: 'fe-2',
          environmentId: 'env-2',
          environmentName: 'Production',
          enabled: false,
          defaultValue: 'false',
          inherited: false,
          isBrandSpecific: true,
          default: { enabled: true, defaultValue: 'true' },
        },
      ],
    },
  ]
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/projects/${PROJECT_ID}/brands/${BRAND_ID}`]}
    >
      <Routes>
        <Route
          path="/projects/:projectId/brands/:brandId"
          element={<BrandDetailPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

async function row(label: string) {
  const rows = await screen.findAllByTestId('flag-value-row')
  const found = rows.find((r) => within(r).queryByText(label))
  if (!found) throw new Error(`row ${label} not found`)
  return found
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  state.flags = brandFlags()
  api.get.mockImplementation(() =>
    Promise.resolve({
      data: {
        brand: { id: BRAND_ID, name: 'Alpha', key: 'alpha', description: null },
        flags: state.flags,
      },
    })
  )
})

/** Applies a change to the mocked server state of one environment. */
function setServerEnv(index: number, patch: Record<string, unknown>) {
  const next = brandFlags()
  Object.assign(next[0].environments[index], patch)
  state.flags = next
}

const linkButton = (r: HTMLElement) =>
  within(r).getByRole('button', { name: /inherits default|own value/i })

describe('BrandDetailPage', () => {
  it('shows the link state per row', async () => {
    renderPage()

    const dev = linkButton(await row('Development'))
    expect(dev).toHaveAttribute('aria-pressed', 'true')
    expect(dev).toHaveAccessibleName(
      'Development Alpha: inherits default – click to set own value'
    )
    const prod = linkButton(await row('Production'))
    expect(prod).toHaveAttribute('aria-pressed', 'false')
    expect(prod).toHaveAccessibleName(
      'Production Alpha: own value – click to follow the default again'
    )
    expect(screen.queryByText('Reset')).not.toBeInTheDocument()
    expect(screen.getByText(/follows default/)).toBeInTheDocument()
  })

  it('toggling a linked environment creates an override', async () => {
    api.post.mockImplementationOnce(() => {
      setServerEnv(0, {
        enabled: false,
        inherited: false,
        isBrandSpecific: true,
      })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    const switchEl = within(await row('Development')).getByRole('switch', {
      name: 'Development Alpha enabled',
    })
    expect(switchEl).toBeChecked()
    await userEvent.click(switchEl)

    expect(api.post).toHaveBeenCalledWith(
      `/brands/${BRAND_ID}/flags/flag-1/toggle`,
      { environmentId: 'env-1', enabled: false }
    )
    // optimistic: the row is unlinked
    expect(linkButton(await row('Development'))).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('unlinking keeps the current value and creates an override', async () => {
    renderPage()

    await userEvent.click(linkButton(await row('Development')))

    expect(api.post).toHaveBeenCalledWith(
      `/brands/${BRAND_ID}/flags/flag-1/toggle`,
      { environmentId: 'env-1', enabled: true }
    )
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('re-linking deletes the override and follows the default', async () => {
    api.delete.mockImplementationOnce(() => {
      setServerEnv(1, {
        enabled: true,
        defaultValue: 'true',
        inherited: true,
        isBrandSpecific: false,
      })
      return Promise.resolve({ data: {} })
    })
    renderPage()

    const production = await row('Production')
    expect(within(production).getByRole('switch')).not.toBeChecked()
    await userEvent.click(linkButton(production))

    expect(api.delete).toHaveBeenCalledWith(
      `/brands/${BRAND_ID}/flags/flag-1/environments/env-2`
    )
    const after = await row('Production')
    expect(linkButton(after)).toHaveAttribute('aria-pressed', 'true')
    expect(within(after).getByRole('switch')).toBeChecked()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Alpha follows the default again: on'
      )
    )
  })

  it('refetches instead of restoring a snapshot when a mutation fails', async () => {
    renderPage()
    await row('Production')
    api.delete.mockRejectedValueOnce(new Error('nope'))
    // Server state after the failure (e.g. someone else changed env-1)
    const serverState = brandFlags()
    serverState[0].environments[0].enabled = false
    state.flags = serverState
    const getCalls = api.get.mock.calls.length

    await userEvent.click(linkButton(await row('Production')))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
    expect(api.get.mock.calls.length).toBeGreaterThan(getCalls)
    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('flag-value-row')[0]).getByRole('switch')
      ).not.toBeChecked()
    )
    // The failed re-link shows the server state again: still own value
    expect(linkButton(await row('Production'))).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('BrandDetailPage layout and states', () => {
  it('shows the brand in the page header with a breadcrumb to the brands list', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Alpha' })
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Brands' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/brands`
    )
    expect(screen.getByRole('link', { name: 'Banner' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/flags/flag-1`
    )
  })

  it('shows an empty state when the project has no flags', async () => {
    state.flags = []
    renderPage()
    expect(await screen.findByText('No feature flags')).toBeInTheDocument()
  })

  it('shows "not found" for an unknown brand', async () => {
    api.get.mockRejectedValue({
      isAxiosError: true,
      message: 'Not Found',
      response: { status: 404, data: {} },
    })
    renderPage()
    expect(await screen.findByText('Brand not found')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to brands' })
    ).toBeInTheDocument()
  })

  it('shows an error state with retry when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The brand could not be loaded.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Alpha' })
    ).toBeInTheDocument()
  })
})
