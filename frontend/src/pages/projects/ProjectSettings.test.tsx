import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '0123456789abcdef01234567'
const ORG_ID = 'org-1'

const DEV = {
  id: 'env-dev',
  name: 'Development',
  key: 'development',
  flagCount: 0,
}
const PROD = {
  id: 'env-prod',
  name: 'Production',
  key: 'production',
  flagCount: 0,
}
const STAGE = { id: 'env-stage', name: 'Staging', key: 'staging', flagCount: 0 }

const state = vi.hoisted(() => ({ envs: [] as unknown[] }))

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
}))

import ProjectSettings from './ProjectSettings'

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
            type: 'SINGLE',
            allowedOrigins: [],
            organizationId: ORG_ID,
          },
        },
      })
    }
    if (url === `/environments/project/${PROJECT_ID}`) {
      return Promise.resolve({ data: { environments: state.envs } })
    }
    if (url === `/brands/project/${PROJECT_ID}`) {
      return Promise.resolve({ data: { brands: [] } })
    }
    if (url === `/organizations/${ORG_ID}/members`) {
      return Promise.resolve({
        data: { members: [{ id: 'm1', userId: 'user-1', role: 'ADMIN' }] },
      })
    }
    if (url === '/auth/me') {
      return Promise.resolve({ data: { user: { id: 'user-1' } } })
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
          element={<ProjectSettings />}
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

describe('ProjectSettings environment order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.envs = [DEV, PROD, STAGE]
    mockGets()
  })

  it('renders environments in the order the API returns', async () => {
    state.envs = [PROD, STAGE, DEV]
    renderPage()
    await screen.findByRole('button', { name: 'Move Production down' })
    expect(renderedOrder()).toEqual(['Production', 'Staging', 'Development'])
  })

  it('moves an environment with labelled buttons and sends the new id order', async () => {
    api.post.mockResolvedValue({
      data: { environments: [PROD, DEV, STAGE] },
    })
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
      { environmentIds: ['env-prod', 'env-dev', 'env-stage'] }
    )
    expect(renderedOrder()).toEqual(['Production', 'Development', 'Staging'])
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('can be operated with the keyboard', async () => {
    api.post.mockResolvedValue({
      data: { environments: [DEV, STAGE, PROD] },
    })
    renderPage()
    const down = await screen.findByRole('button', {
      name: 'Move Production down',
    })
    down.focus()
    await userEvent.keyboard('{Enter}')

    expect(api.post).toHaveBeenCalledWith(
      `/environments/project/${PROJECT_ID}/reorder`,
      { environmentIds: ['env-dev', 'env-stage', 'env-prod'] }
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
    const envGets = () =>
      api.get.mock.calls.filter(
        ([url]) => url === `/environments/project/${PROJECT_ID}`
      ).length
    expect(envGets()).toBe(1)
    // The server meanwhile has another order (e.g. changed in another tab)
    state.envs = [STAGE, DEV, PROD]

    await userEvent.click(up)

    await waitFor(() => expect(envGets()).toBe(2))
    expect(toast.error).toHaveBeenCalled()
    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Staging', 'Development', 'Production'])
    )
  })

  it('keeps the flag counts it already has when refetching after an error', async () => {
    state.envs = [
      { ...DEV, flagCount: 4 },
      { ...PROD, flagCount: 7 },
    ]
    api.post.mockRejectedValue({ response: { data: { message: 'boom' } } })
    renderPage()
    const up = await screen.findByRole('button', { name: 'Move Production up' })
    expect(screen.getByText('7 flags')).toBeInTheDocument()
    // The refetched rows carry no counts
    state.envs = [
      { id: PROD.id, name: PROD.name, key: PROD.key },
      { id: DEV.id, name: DEV.name, key: DEV.key },
    ]

    await userEvent.click(up)

    await waitFor(() =>
      expect(renderedOrder()).toEqual(['Production', 'Development'])
    )
    expect(screen.getByText('7 flags')).toBeInTheDocument()
    expect(screen.getByText('4 flags')).toBeInTheDocument()
  })
})
