import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = 'p1'

const state = vi.hoisted(() => ({ type: 'MULTI' as 'SINGLE' | 'MULTI' }))
const api = vi.hoisted(() => ({ get: vi.fn() }))
const sdk = vi.hoisted(() => ({ fetchBrandMatrix: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('@/lib/sdk-tester', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sdk-tester')>()),
  fetchBrandMatrix: sdk.fetchBrandMatrix,
}))

import SdkTesterPage from './SdkTesterPage'

const BRANDS = [
  { id: 'b1', key: 'alpha', name: 'Alpha' },
  { id: 'b2', key: 'beta', name: 'Beta' },
]

function mockGets() {
  api.get.mockImplementation((url: string) => {
    if (url === `/projects/${PROJECT_ID}`) {
      return Promise.resolve({
        data: {
          project: {
            id: PROJECT_ID,
            name: 'Shop',
            key: 'shop',
            description: null,
            type: state.type,
            allowedOrigins: [],
            organizationId: 'o1',
            environments: [
              { id: 'env-dev', name: 'Development', key: 'development' },
              { id: 'env-prod', name: 'Production', key: 'production' },
            ],
          },
        },
      })
    }
    if (url === `/brands/project/${PROJECT_ID}`)
      return Promise.resolve({ data: { brands: BRANDS } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

const matrix = () => ({
  columns: [
    { key: null, label: 'Default' },
    { key: 'alpha', label: 'Alpha' },
    { key: 'beta', label: 'Beta' },
  ],
  rows: [
    {
      flagKey: 'banner',
      flagType: 'BOOLEAN',
      cells: {
        default: { value: true, enabled: true, flagType: 'BOOLEAN' },
        alpha: { value: false, enabled: false, flagType: 'BOOLEAN' },
      },
    },
    {
      flagKey: 'headline',
      flagType: 'STRING',
      cells: {
        default: { value: 'Hello', enabled: true, flagType: 'STRING' },
        alpha: { value: 'Hi Alpha', enabled: true, flagType: 'STRING' },
      },
    },
  ],
  errors: { beta: 'Brand not found' },
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/sdk`]}>
      <Routes>
        <Route path="/projects/:projectId/sdk" element={<SdkTesterPage />} />
      </Routes>
    </MemoryRouter>
  )

const code = () =>
  screen.getByRole('figure', { name: 'Generated SDK code' }).textContent ?? ''

async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('API key'), 'tk_test')
  await user.click(screen.getByRole('button', { name: 'Run test' }))
}

describe('SdkTesterPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    state.type = 'MULTI'
    mockGets()
    sdk.fetchBrandMatrix.mockResolvedValue(matrix())
  })

  it('takes the project from the route and preselects the first environment', async () => {
    renderPage()
    expect(
      await screen.findByRole('combobox', { name: 'Environment' })
    ).toHaveTextContent('Development')
    expect(
      screen.queryByRole('combobox', { name: 'Project' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/2 brands; every brand is tested separately/)
    ).toBeInTheDocument()
    expect(code()).toContain("project: 'shop'")
    expect(code()).toContain("environment: 'development'")
  })

  it('needs an API key before running', async () => {
    renderPage()
    await screen.findByLabelText('API key')
    expect(screen.getByRole('button', { name: 'Run test' })).toBeDisabled()
  })

  it('evaluates the defaults and every brand and shows the matrix', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Attribute 1 value'), '42')
    await run(user)

    expect(sdk.fetchBrandMatrix).toHaveBeenCalledWith({
      projectKey: 'shop',
      environmentKey: 'development',
      apiKey: 'tk_test',
      context: { userId: 42 },
      brands: BRANDS,
    })
    const table = await screen.findByRole('table', { name: 'Results' })
    const header = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(header).toEqual(['Flag', 'Default', 'Alphaalpha', 'Betabeta'])
    // A failing brand shows its error instead of values
    expect(within(table).getAllByText('Brand not found')).toHaveLength(2)
    expect(
      within(table).getByRole('button', {
        name: 'Use headline (Alpha) in the code',
      })
    ).toHaveTextContent('"Hi Alpha"')
  })

  it('puts the clicked flag and brand into the generated code', async () => {
    const user = userEvent.setup()
    renderPage()
    await run(user)
    const table = await screen.findByRole('table', { name: 'Results' })
    // Default: first flag, no brand
    expect(code()).toContain("client.isEnabled('banner', false)")
    expect(code()).not.toContain('brandKey')

    const cell = within(table).getByRole('button', {
      name: 'Use headline (Alpha) in the code',
    })
    await user.click(cell)

    expect(cell).toHaveAttribute('aria-pressed', 'true')
    expect(code()).toContain("client.getString('headline', '')")
    expect(code()).toContain('"brandKey": "alpha"')
  })

  it('does not send brands for single projects', async () => {
    state.type = 'SINGLE'
    const user = userEvent.setup()
    renderPage()
    await run(user)
    await waitFor(() =>
      expect(sdk.fetchBrandMatrix).toHaveBeenCalledWith(
        expect.objectContaining({ brands: [] })
      )
    )
    expect(api.get).not.toHaveBeenCalledWith(`/brands/project/${PROJECT_ID}`)
  })

  it('shows the reason when every request failed', async () => {
    sdk.fetchBrandMatrix.mockResolvedValue({
      columns: [{ key: null, label: 'Default' }],
      rows: [],
      errors: { default: 'Invalid API key' },
    })
    const user = userEvent.setup()
    renderPage()
    await run(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid API key'
    )
    expect(
      screen.queryByRole('table', { name: 'Results' })
    ).not.toBeInTheDocument()
  })

  it('shows an error state when the project cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The project could not be loaded.'
    )
  })
})
