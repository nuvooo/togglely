import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const ORG_ID = 'org-1'

const state = vi.hoisted(() => ({
  role: 'ADMIN',
  projects: [] as unknown[] | Error,
}))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [],
    organizations: [{ id: ORG_ID, name: 'Acme', role: state.role }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import { refreshWorkspace } from '@/lib/workspace'
import OrgProjectsPage from './OrgProjectsPage'

const SHOP = {
  id: 'p1',
  name: 'Shop',
  key: 'shop',
  type: 'MULTI',
  environmentCount: 3,
  flagCount: 12,
  updatedAt: new Date().toISOString(),
}
const BLOG = {
  ...SHOP,
  id: 'p2',
  name: 'Blog',
  key: 'blog',
  type: 'SINGLE',
  flagCount: 1,
}

function Location() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const renderPage = (path = `/orgs/${ORG_ID}/projects`) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/orgs/:orgId/projects" element={<OrgProjectsPage />} />
        <Route
          path="/projects/:projectId/flags"
          element={<p>project page</p>}
        />
      </Routes>
      <Location />
    </MemoryRouter>
  )

describe('OrgProjectsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    state.role = 'ADMIN'
    state.projects = [SHOP, BLOG]
    api.get.mockReset()
    api.post.mockReset()
    toast.success.mockClear()
    api.get.mockImplementation((url: string) => {
      if (url === `/projects/organization/${ORG_ID}`) {
        return state.projects instanceof Error
          ? Promise.reject(state.projects)
          : Promise.resolve({ data: { projects: state.projects } })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  it('lists the projects with type and counts under the organization name', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme' })
    ).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Projects' })
    const shop = within(table)
      .getByRole('link', { name: 'Shop' })
      .closest('tr')!
    expect(within(shop).getByText('shop')).toBeInTheDocument()
    expect(within(shop).getByText('Multi-brand')).toBeInTheDocument()
    expect(within(shop).getByText('3')).toBeInTheDocument()
    expect(within(shop).getByText('12')).toBeInTheDocument()
    expect(within(table).getByText('Single')).toBeInTheDocument()
  })

  it('filters by name or key', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('link', { name: 'Shop' })
    await user.type(screen.getByRole('searchbox'), 'blo')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Shop' })).toBeNull()
    )
    expect(screen.getByRole('link', { name: 'Blog' })).toBeInTheDocument()
  })

  it('creates a project and opens it', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ data: { project: { id: 'p9' } } })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Mobile App')
    expect(within(dialog).getByLabelText('Key')).toHaveValue('mobile-app')
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'MULTI')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/projects/organization/${ORG_ID}`,
        {
          name: 'Mobile App',
          key: 'mobile-app',
          type: 'MULTI',
        }
      )
    )
    expect(refreshWorkspace).toHaveBeenCalled()
    expect(await screen.findByText('project page')).toBeInTheDocument()
  })

  it('keeps the dialog open with the error when creating fails', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: 'Key already exists' } },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Shop')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Key already exists'
    )
  })

  it('opens the dialog for ?action=create-project and drops the parameter', async () => {
    renderPage(`/orgs/${ORG_ID}/projects?action=create-project`)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/orgs/${ORG_ID}/projects`
      )
    )
    expect(screen.getByTestId('location').textContent).not.toContain('action')
  })

  it('offers no create action to members and viewers', async () => {
    state.role = 'MEMBER'
    renderPage(`/orgs/${ORG_ID}/projects?action=create-project`)
    await screen.findByRole('link', { name: 'Shop' })
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an empty state with a create action', async () => {
    state.projects = []
    renderPage()
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'New project' })
    ).toBeInTheDocument()
  })

  it('shows a load error with retry', async () => {
    const user = userEvent.setup()
    state.projects = new Error('down')
    renderPage()
    expect(
      await screen.findByText('The projects could not be loaded.')
    ).toBeInTheDocument()
    state.projects = [SHOP]
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('link', { name: 'Shop' })
    ).toBeInTheDocument()
  })
})
