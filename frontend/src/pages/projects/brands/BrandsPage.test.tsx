import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = 'p1'
const ORG_ID = 'o1'

const state = vi.hoisted(() => ({
  type: 'MULTI' as 'SINGLE' | 'MULTI',
  brands: [] as unknown[],
  role: 'ADMIN',
}))
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
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
        type: state.type,
        organizationId: ORG_ID,
      },
    ],
    organizations: [{ id: ORG_ID, name: 'Acme', role: state.role }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import { refreshWorkspace } from '@/lib/workspace'
import BrandsPage from './BrandsPage'

const ALPHA = {
  id: 'b1',
  name: 'Alpha',
  key: 'alpha',
  description: 'First brand',
}
const BETA = { id: 'b2', name: 'Beta', key: 'beta', description: null }

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
            organizationId: ORG_ID,
          },
        },
      })
    }
    if (url === `/brands/project/${PROJECT_ID}`)
      return Promise.resolve({ data: { brands: state.brands } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/brands`]}>
      <Routes>
        <Route path="/projects/:projectId/brands" element={<BrandsPage />} />
        <Route
          path="/projects/:projectId/brands/:brandId"
          element={<p>brand detail</p>}
        />
        <Route
          path="/projects/:projectId/settings"
          element={<p>settings page</p>}
        />
      </Routes>
    </MemoryRouter>
  )

describe('BrandsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    state.type = 'MULTI'
    state.brands = [ALPHA, BETA]
    state.role = 'ADMIN'
    mockGets()
  })

  it('lists the brands of a multi-brand project', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Brands' })
    expect(within(table).getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/brands/b1`
    )
    expect(within(table).getByText('alpha')).toBeInTheDocument()
    expect(within(table).getByText('First brand')).toBeInTheDocument()
    expect(within(table).getByText('Beta')).toBeInTheDocument()
  })

  it('opens the brand detail on row click', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Brands' })
    await userEvent.click(within(table).getByText('beta'))
    expect(await screen.findByText('brand detail')).toBeInTheDocument()
  })

  it('explains brands for single projects instead of listing them', async () => {
    state.type = 'SINGLE'
    renderPage()
    expect(
      await screen.findByText('Brands are for multi-brand projects')
    ).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(`/brands/project/${PROJECT_ID}`)
    await userEvent.click(screen.getByRole('link', { name: 'Open settings' }))
    expect(await screen.findByText('settings page')).toBeInTheDocument()
  })

  it('shows an empty state with the add action when there are no brands', async () => {
    state.brands = []
    renderPage()
    expect(await screen.findByText('No brands yet')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add brand' })
    ).toBeInTheDocument()
  })

  it('creates a brand', async () => {
    const created = {
      id: 'b3',
      name: 'Gamma Shop',
      key: 'gamma-shop',
      description: 'Third',
    }
    api.post.mockResolvedValue({ data: { brand: created } })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add brand' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Gamma Shop')
    expect(within(dialog).getByLabelText('Key')).toHaveValue('gamma-shop')
    await userEvent.type(within(dialog).getByLabelText('Description'), 'Third')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add brand' })
    )

    expect(api.post).toHaveBeenCalledWith(`/brands/project/${PROJECT_ID}`, {
      name: 'Gamma Shop',
      key: 'gamma-shop',
      description: 'Third',
    })
    expect(
      await screen.findByRole('link', { name: 'Gamma Shop' })
    ).toBeInTheDocument()
  })

  it('edits a brand (the update response wraps the brand)', async () => {
    api.patch.mockResolvedValue({
      data: { brand: { ...ALPHA, name: 'Alpha Store' } },
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Alpha' })
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Key')).not.toBeInTheDocument()
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Alpha Store')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(api.patch).toHaveBeenCalledWith('/brands/b1', {
      name: 'Alpha Store',
      description: 'First brand',
    })
    expect(
      await screen.findByRole('link', { name: 'Alpha Store' })
    ).toBeInTheDocument()
  })

  it('deletes a brand after confirmation', async () => {
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Beta' })
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' })
    )

    expect(api.delete).toHaveBeenCalledWith('/brands/b2')
    await waitFor(() =>
      expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    )
  })

  it('keeps the delete dialog open with the error when deleting fails', async () => {
    api.delete.mockImplementationOnce(() =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 403, data: { message: 'Forbidden resource' } },
      })
    )
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Beta' })
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' })
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Forbidden resource'
    )
    expect(toast.error).toHaveBeenCalledWith('No permission')
    expect(refreshWorkspace).toHaveBeenCalled()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('ignores a late response of the previous project', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    const project = (id: string) => ({
      data: {
        project: { id, name: id, key: id, description: null, type: 'MULTI', allowedOrigins: [], organizationId: ORG_ID },
      },
    })
    api.get.mockImplementation((url: string) => {
      if (url === `/projects/${PROJECT_ID}`) return Promise.resolve(project(PROJECT_ID))
      if (url === '/projects/p2') return Promise.resolve(project('p2'))
      if (url === `/brands/project/${PROJECT_ID}`)
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      return Promise.resolve({ data: { brands: [BETA] } })
    })
    function Switcher() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/projects/p2/brands')}>
          switch
        </button>
      )
    }
    render(
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/brands`]}>
        <Switcher />
        <Routes>
          <Route path="/projects/:projectId/brands" element={<BrandsPage />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/brands/project/${PROJECT_ID}`)
    )
    await userEvent.click(screen.getByRole('button', { name: 'switch' }))
    await screen.findByText('Beta')
    resolveFirst({ data: { brands: [ALPHA] } })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and shows the server message when creating fails', async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Brand key already exists' } },
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add brand' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Alpha')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add brand' })
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Brand key already exists')
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('is read-only for members', async () => {
    state.role = 'MEMBER'
    renderPage()
    await screen.findByRole('table', { name: 'Brands' })
    expect(
      screen.queryByRole('button', { name: 'Add brand' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Actions for/ })
    ).not.toBeInTheDocument()
  })

  it('shows an error state when loading fails', async () => {
    api.get.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The brands could not be loaded.'
    )
  })
})
