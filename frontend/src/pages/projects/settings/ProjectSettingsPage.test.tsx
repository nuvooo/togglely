import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const PROJECT_ID = 'p1'
const ORG_ID = 'o1'

const state = vi.hoisted(() => ({
  role: 'ADMIN',
  project: null as Record<string, unknown> | null,
  brands: [] as unknown[],
}))
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
}))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const workspace = vi.hoisted(() => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  forgetProject: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: workspace.refreshWorkspace,
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
vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({ forgetProject: workspace.forgetProject }),
  },
}))

import ProjectSettingsPage from './ProjectSettingsPage'

const baseProject = () => ({
  id: PROJECT_ID,
  name: 'Shop',
  key: 'shop',
  description: 'Web shop',
  type: 'SINGLE',
  allowedOrigins: ['https://shop.example.com'],
  organizationId: ORG_ID,
  environments: [{ id: 'env-dev', name: 'Development', key: 'development' }],
})

function mockGets() {
  api.get.mockImplementation((url: string) => {
    if (url === `/projects/${PROJECT_ID}`)
      return Promise.resolve({ data: { project: state.project } })
    if (url === `/brands/project/${PROJECT_ID}`)
      return Promise.resolve({ data: { brands: state.brands } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
  // The server echoes the update
  api.patch.mockImplementation((_url: string, body: Record<string, unknown>) =>
    Promise.resolve({ data: { project: { ...state.project, ...body } } })
  )
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/settings`]}>
      <Routes>
        <Route
          path="/projects/:projectId/settings"
          element={<ProjectSettingsPage />}
        />
        <Route path="/orgs/:orgId/projects" element={<p>org projects</p>} />
      </Routes>
    </MemoryRouter>
  )

const section = (name: string) => screen.getByRole('region', { name })

/** Radix Select needs pointer capture APIs that jsdom lacks. */
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

describe('ProjectSettingsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    state.role = 'ADMIN'
    state.project = baseProject()
    state.brands = []
    mockGets()
  })

  it('shows the sections: general, allowed origins, integration and danger zone', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' })
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Name')).toHaveValue('Shop')
    expect(screen.getByLabelText('Key')).toHaveValue('shop')
    expect(screen.getByLabelText('Key')).toBeDisabled()
    expect(section('General')).toBeInTheDocument()
    expect(
      within(section('Allowed origins')).getByText('https://shop.example.com')
    ).toBeInTheDocument()
    expect(
      within(section('Integration')).getByText('Live stream URL')
    ).toBeInTheDocument()
    expect(
      within(section('Danger zone')).getByRole('button', {
        name: 'Delete project',
      })
    ).toBeInTheDocument()
  })

  it('saves name and description', async () => {
    renderPage()
    const name = await screen.findByLabelText('Name')
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.clear(name)
    await userEvent.type(name, 'Shop EU')
    await userEvent.click(save)

    expect(api.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}`, {
      name: 'Shop EU',
      description: 'Web shop',
      type: 'SINGLE',
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Project saved')
    )
    expect(workspace.refreshWorkspace).toHaveBeenCalled()
  })

  it('asks before converting a multi-brand project with brands to single', async () => {
    state.project = { ...baseProject(), type: 'MULTI' }
    state.brands = [{ id: 'b1' }, { id: 'b2' }]
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Name')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/brands/project/${PROJECT_ID}`)
    )
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /Single/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog')
    // The backend keeps the brands; SINGLE projects ignore them.
    expect(
      within(dialog).getByText(/All 2 brands are kept/)
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/deleted/)).not.toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Convert' }))
    expect(api.patch).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}`,
      expect.objectContaining({ type: 'SINGLE' })
    )
  })

  it('blocks converting to single until the brand count is loaded', async () => {
    state.project = { ...baseProject(), type: 'MULTI' }
    let resolveBrands: (value: unknown) => void = () => {}
    api.get.mockImplementation((url: string) => {
      if (url === `/projects/${PROJECT_ID}`)
        return Promise.resolve({ data: { project: state.project } })
      return new Promise((resolve) => {
        resolveBrands = resolve
      })
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Name')
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /Single/ }))

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByText(/Loading the brands/)).toBeInTheDocument()

    resolveBrands({ data: { brands: [{ id: 'b1' }] } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/The brand is kept/)).toBeInTheDocument()
  })

  it('asks anyway when the brand count could not be loaded', async () => {
    state.project = { ...baseProject(), type: 'MULTI' }
    api.get.mockImplementation((url: string) =>
      url === `/projects/${PROJECT_ID}`
        ? Promise.resolve({ data: { project: state.project } })
        : Promise.reject(new Error('down'))
    )
    api.patch.mockResolvedValue({
      data: { project: { ...state.project, type: 'SINGLE' } },
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Name')
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /Single/ }))
    expect(
      await screen.findByText(/brands could not be loaded/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/Existing brands are kept/)
    ).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Convert' }))
    expect(api.patch).toHaveBeenCalled()
  })

  it('a 403 on save toasts "No permission" and reloads the role', async () => {
    api.patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: { message: 'Forbidden resource' } },
    })
    const user = userEvent.setup()
    renderPage()
    const name = await screen.findByLabelText('Name')
    await user.type(name, ' 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No permission')
    )
    expect(workspace.refreshWorkspace).toHaveBeenCalled()
  })

  it('edits the allowed origins list and saves only the origins', async () => {
    renderPage()
    const origins = await screen.findByRole('region', {
      name: 'Allowed origins',
    })
    const input = within(origins).getByLabelText('Add origin')
    await userEvent.type(input, '*.example.com{Enter}')
    await userEvent.click(
      within(origins).getByRole('button', {
        name: 'Remove https://shop.example.com',
      })
    )
    expect(
      within(within(origins).getByRole('list')).getByText('*.example.com')
    ).toBeInTheDocument()
    expect(
      within(origins).queryByText('https://shop.example.com')
    ).not.toBeInTheDocument()

    await userEvent.click(
      within(origins).getByRole('button', { name: 'Save origins' })
    )
    expect(api.patch).toHaveBeenCalledWith(`/projects/${PROJECT_ID}`, {
      allowedOrigins: ['*.example.com'],
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Allowed origins saved')
    )
  })

  it('rejects duplicate origins', async () => {
    renderPage()
    const origins = await screen.findByRole('region', {
      name: 'Allowed origins',
    })
    await userEvent.type(
      within(origins).getByLabelText('Add origin'),
      'https://shop.example.com{Enter}'
    )
    expect(toast.error).toHaveBeenCalledWith(
      'https://shop.example.com is already in the list.'
    )
    expect(
      within(origins).getAllByText('https://shop.example.com')
    ).toHaveLength(1)
  })

  it('deletes the project only after typing its key', async () => {
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete project' })
    )
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete project',
    })
    expect(confirm).toBeDisabled()
    const input = within(dialog).getByLabelText('Type shop to confirm')
    await userEvent.type(input, 'sho')
    expect(confirm).toBeDisabled()
    await userEvent.type(input, 'p')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)

    expect(api.delete).toHaveBeenCalledWith(`/projects/${PROJECT_ID}`)
    expect(workspace.forgetProject).toHaveBeenCalledWith(PROJECT_ID)
    expect(workspace.refreshWorkspace).toHaveBeenCalled()
    expect(await screen.findByText('org projects')).toBeInTheDocument()
  })

  it('keeps the dialog open and reports when deleting fails', async () => {
    api.delete.mockRejectedValueOnce({
      response: { data: { message: 'Forbidden resource' } },
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete project' })
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText('Type shop to confirm'),
      'shop'
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete project' })
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Forbidden resource')
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(workspace.forgetProject).not.toHaveBeenCalled()
  })

  it('is read-only for members and hides the danger zone', async () => {
    state.role = 'MEMBER'
    renderPage()
    expect(await screen.findByLabelText('Name')).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save origins' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Danger zone' })
    ).not.toBeInTheDocument()
  })

  it('shows an error state when the project cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The project settings could not be loaded.'
    )
  })
})
