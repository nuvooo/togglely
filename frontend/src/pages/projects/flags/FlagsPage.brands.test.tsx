import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = '0123456789abcdef01234567'

const state = vi.hoisted(() => ({ flags: [] as unknown[] }))

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/lib/axios', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [{ id: PROJECT_ID, organizationId: 'o1', type: 'SINGLE' }],
    organizations: [{ id: 'o1', name: 'Acme', role: role.current }],
    isLoading: false,
    error: null,
  }),
}))
const role = vi.hoisted(() => ({ current: 'ADMIN' }))

import FlagsPage from './FlagsPage'

function flag(flagType: string, defaultValue: string, brandOverride: string) {
  return {
    id: 'flag-1',
    name: 'Banner',
    key: 'banner',
    flagType,
    environments: [
      {
        id: 'fe-1',
        environmentId: 'env-1',
        environmentName: 'Development',
        enabled: true,
        defaultValue,
        brandValues: [
          {
            brandId: 'brand-a',
            brandName: 'Alpha',
            enabled: true,
            defaultValue,
            inherited: true,
            isBrandSpecific: false,
          },
          {
            brandId: 'brand-b',
            brandName: 'Beta',
            enabled: false,
            defaultValue: brandOverride,
            inherited: false,
            isBrandSpecific: true,
          },
        ],
      },
    ],
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/flags`]}>
      <Routes>
        <Route path="/projects/:projectId/flags" element={<FlagsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

/** Link toggle of a brand row. */
const linkButton = (r: HTMLElement) =>
  within(r).getByRole('button', { name: /inherits default|own value/i })

/** Expands the brand matrix of the flag (once). */
async function expand() {
  const toggle = await screen.findByRole('button', {
    name: 'Brand values of Banner',
  })
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    await userEvent.click(toggle)
  }
}

/** Row of the (expanded) brand matrix whose label matches. */
async function row(label: string) {
  await expand()
  const rows = await screen.findAllByTestId('flag-value-row')
  const found = rows.find((r) => within(r).queryByText(label))
  if (!found) throw new Error(`row ${label} not found`)
  return found
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data:
        url === `/projects/${PROJECT_ID}`
          ? {
              project: {
                id: PROJECT_ID,
                name: 'Stark',
                key: 'stark',
                type: 'MULTI',
                organizationId: 'o1',
              },
            }
          : { flags: state.flags },
    })
  )
})

describe('FlagsPage (multi-brand)', () => {
  it('renders the default switch and the link state per brand', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()

    const defaultRow = await row('Default (all brands)')
    expect(
      within(defaultRow).getByRole('switch', {
        name: 'Development Default (all brands) enabled',
      })
    ).toBeChecked()

    expect(
      within(defaultRow).queryByRole('button', { name: /inherits default/i })
    ).not.toBeInTheDocument()

    const alpha = linkButton(await row('Alpha'))
    expect(alpha).toHaveAttribute('aria-pressed', 'true')
    expect(alpha).toHaveAccessibleName(
      'Development Alpha: inherits default – click to set own value'
    )

    const beta = linkButton(await row('Beta'))
    expect(beta).toHaveAttribute('aria-pressed', 'false')
    expect(beta).toHaveAccessibleName(
      'Development Beta: own value – click to follow the default again'
    )
    expect(screen.queryByText('Reset')).not.toBeInTheDocument()
    expect(screen.getByText(/follows default/)).toBeInTheDocument()
  })

  it('has an accessible delete button per flag', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()
    expect(
      await screen.findByRole('button', { name: 'Delete flag Banner' })
    ).toBeInTheDocument()
  })

  it('unlink creates an override with the current value; relink deletes it', async () => {
    state.flags = [flag('STRING', 'blue', 'red')]
    renderPage()

    await userEvent.click(linkButton(await row('Alpha')))
    expect(api.post).toHaveBeenCalledWith(
      '/brands/brand-a/flags/flag-1/toggle',
      { environmentId: 'env-1', enabled: true }
    )
    expect(api.patch).not.toHaveBeenCalled()

    await userEvent.click(linkButton(await row('Beta')))
    expect(api.delete).toHaveBeenCalledWith(
      '/brands/brand-b/flags/flag-1/environments/env-1'
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Beta follows the default again: blue'
      )
    )
  })

  it('refetches and toasts when a mutation fails', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()
    await row('Beta')
    api.delete.mockRejectedValueOnce(new Error('nope'))
    const getCalls = api.get.mock.calls.length

    await userEvent.click(linkButton(await row('Beta')))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(api.get.mock.calls.length).toBeGreaterThan(getCalls)
    expect(linkButton(await row('Beta'))).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('toggles the default via the default endpoint', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()

    await userEvent.click(
      within(await row('Default (all brands)')).getByRole('switch')
    )

    expect(api.post).toHaveBeenCalledWith('/feature-flags/flag-1/toggle', {
      environmentId: 'env-1',
      enabled: false,
    })
  })

  it('toggling an inherited brand creates an override; relink deletes it', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()

    await userEvent.click(within(await row('Alpha')).getByRole('switch'))
    expect(api.post).toHaveBeenCalledWith(
      '/brands/brand-a/flags/flag-1/toggle',
      { environmentId: 'env-1', enabled: false }
    )

    await userEvent.click(linkButton(await row('Beta')))
    expect(api.delete).toHaveBeenCalledWith(
      '/brands/brand-b/flags/flag-1/environments/env-1'
    )
  })

  it('edits a STRING brand value with brandId', async () => {
    state.flags = [flag('STRING', 'blue', 'red')]
    renderPage()

    await userEvent.click(
      within(await row('Beta')).getByRole('button', { name: /edit value/i })
    )
    const input = await screen.findByLabelText('Value (STRING)')
    expect(input).toHaveValue('red')
    await userEvent.clear(input)
    await userEvent.type(input, 'green')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/feature-flags/flag-1/environments/env-1/value',
        { value: 'green', brandId: 'brand-b' }
      )
    )
  })

  it('edits the default value without brandId', async () => {
    state.flags = [flag('STRING', 'blue', 'red')]
    renderPage()

    await userEvent.click(
      within(await row('Default (all brands)')).getByRole('button', {
        name: /edit value/i,
      })
    )
    const input = await screen.findByLabelText('Value (STRING)')
    await userEvent.clear(input)
    await userEvent.type(input, 'navy')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/feature-flags/flag-1/environments/env-1/value',
        { value: 'navy' }
      )
    )
  })

  it('JSON editor rejects invalid JSON before sending', async () => {
    state.flags = [flag('JSON', '{"a":1}', '{"b":2}')]
    renderPage()

    await userEvent.click(
      within(await row('Alpha')).getByRole('button', { name: /edit value/i })
    )
    const textarea = await screen.findByLabelText('Value (JSON)')
    // pretty-printed for editing
    expect((textarea as HTMLTextAreaElement).value).toBe('{\n  "a": 1\n}')
    expect(
      screen.getByText('Saving creates an own value (override) for this brand.')
    ).toBeInTheDocument()

    await userEvent.clear(textarea)
    await userEvent.type(textarea, '{{"broken"')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid JSON')
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('inherited NUMBER brand shows the default value and label', async () => {
    state.flags = [flag('NUMBER', '42', '7')]
    renderPage()

    const alpha = await row('Alpha')
    expect(within(alpha).getByText('42')).toBeInTheDocument()
    expect(linkButton(alpha)).toHaveAttribute('aria-pressed', 'true')
    const beta = await row('Beta')
    expect(within(beta).getByText('7')).toBeInTheDocument()
  })

  it('NUMBER editor rejects non-numeric input', async () => {
    state.flags = [flag('NUMBER', '42', '7')]
    renderPage()

    await userEvent.click(
      within(await row('Beta')).getByRole('button', { name: /edit value/i })
    )
    const input = await screen.findByLabelText('Value (NUMBER)')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid number.'
    )
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('shows defaults in the table and expands the brand matrix on demand', async () => {
    state.flags = [flag('STRING', 'blue', 'red')]
    renderPage()

    const toggle = await screen.findByRole('button', {
      name: 'Brand values of Banner',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // aria-controls always points at an existing (hidden, empty) region
    const collapsed = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    )
    expect(collapsed).toBeEmptyDOMElement()
    expect(collapsed?.closest('tr')).toHaveAttribute('hidden')
    expect(screen.queryByTestId('flag-value-row')).not.toBeInTheDocument()
    expect(screen.getByText('1 override')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('switch', {
        name: 'Banner default (all brands) enabled in Development',
      })
    )
    expect(api.post).toHaveBeenCalledWith('/feature-flags/flag-1/toggle', {
      environmentId: 'env-1',
      enabled: false,
    })

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    )
    expect(panel).not.toBeNull()
    expect(
      within(panel as HTMLElement).getByTestId('env-card-env-1')
    ).toBeInTheDocument()
    expect(
      within(panel as HTMLElement).getAllByTestId('flag-value-row')
    ).toHaveLength(3)
  })

  it('edits the default from the table value chip with the default target', async () => {
    state.flags = [flag('STRING', 'blue', 'red')]
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Edit value of Banner in Development',
      })
    )
    const input = await screen.findByLabelText('Value (STRING)')
    expect(input).toHaveValue('blue')
    expect(screen.getByRole('dialog')).toHaveTextContent('Default (all brands)')
    await userEvent.clear(input)
    await userEvent.type(input, 'teal')
    await userEvent.click(screen.getByRole('button', { name: 'Save value' }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/feature-flags/flag-1/environments/env-1/value',
        { value: 'teal' }
      )
    )
  })
})
