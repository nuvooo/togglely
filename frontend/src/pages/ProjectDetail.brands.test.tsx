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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import ProjectDetail from './ProjectDetail'

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
        <Route path="/projects/:projectId/flags" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

/** Row of the value list whose label matches. */
async function row(label: string) {
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

describe('ProjectDetail (multi-brand)', () => {
  it('renders the default switch, inherited label and reset button', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()

    const defaultRow = await row('Default (all brands)')
    expect(
      within(defaultRow).getByRole('switch', {
        name: 'Development Default (all brands) enabled',
      })
    ).toBeChecked()

    const alpha = await row('Alpha')
    expect(within(alpha).getByText('inherits default')).toBeInTheDocument()
    expect(within(alpha).queryByText('Reset')).not.toBeInTheDocument()

    const beta = await row('Beta')
    expect(within(beta).queryByText('inherits default')).not.toBeInTheDocument()
    expect(within(beta).getByText('Reset')).toBeInTheDocument()
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

  it('toggling an inherited brand creates an override; reset deletes it', async () => {
    state.flags = [flag('BOOLEAN', 'true', 'false')]
    renderPage()

    await userEvent.click(within(await row('Alpha')).getByRole('switch'))
    expect(api.post).toHaveBeenCalledWith(
      '/brands/brand-a/flags/flag-1/toggle',
      { environmentId: 'env-1', enabled: false }
    )

    await userEvent.click(within(await row('Beta')).getByText('Reset'))
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
    expect(within(alpha).getByText('inherits default')).toBeInTheDocument()
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
})
