import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { axiosError, PROJECT } from './testFixtures'

const mocks = vi.hoisted(() => ({
  role: 'MEMBER' as string,
  get: vi.fn(),
  post: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: PROJECT, name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme', role: mocks.role }],
    isLoading: false,
    error: null,
  }),
}))

import CreateExperiment from './CreateExperiment'

const FLAGS = [
  { id: 'f1', name: 'Checkout button', key: 'checkout-button', flagType: 'STRING' },
  { id: 'f2', name: 'New header', key: 'new-header', flagType: 'BOOLEAN' },
]
const ENVS = [
  { id: 'env-dev', name: 'Development', key: 'development' },
  { id: 'env-prod', name: 'Production', key: 'production' },
]

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

const renderPage = (url = `/projects/${PROJECT}/experiments/new`) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/projects/:projectId/experiments/new" element={<CreateExperiment />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

/** Radix Select needs pointer capture APIs that jsdom lacks. */
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

const choose = async (user: ReturnType<typeof userEvent.setup>, label: string, option: RegExp | string) => {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('CreateExperiment', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    mocks.role = 'MEMBER'
    mocks.get.mockImplementation((url: string) => {
      if (url === `/feature-flags/project/${PROJECT}`) return Promise.resolve({ data: { featureFlags: FLAGS } })
      if (url === `/environments/project/${PROJECT}`) return Promise.resolve({ data: { environments: ENVS } })
      return Promise.reject(axiosError(404))
    })
  })

  it('renders the settings-style sections with project-scoped selects', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'New experiment' })).toBeInTheDocument()
    for (const title of ['General', 'Flag & audience', 'Variants']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(mocks.get).toHaveBeenCalledWith(`/feature-flags/project/${PROJECT}`)
    expect(mocks.get).toHaveBeenCalledWith(`/environments/project/${PROJECT}`)
  })

  it('derives the key from the name until it is edited', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Name', { selector: '#exp-name' }), 'Homepage CTA')
    expect(screen.getByLabelText('Key', { selector: '#exp-key' })).toHaveValue('homepage-cta')
  })

  it('validates before submitting', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Create experiment' }))
    expect(mocks.post).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name', { selector: '#exp-name' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Choose a flag.')).toBeInTheDocument()
    expect(screen.getByText('Choose an environment.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Weight (%)', { selector: '#variant-1-weight' }))
    await user.type(screen.getByLabelText('Weight (%)', { selector: '#variant-1-weight' }), '30')
    expect(screen.getByRole('alert')).toHaveTextContent('The weights must add up to 100 % (currently 80 %).')
    await user.click(screen.getByRole('button', { name: 'Distribute evenly' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates the experiment and opens it', async () => {
    const user = userEvent.setup()
    mocks.post.mockResolvedValue({ data: { id: 'e9', name: 'Checkout test' } })
    renderPage()
    await user.type(await screen.findByLabelText('Name', { selector: '#exp-name' }), 'Checkout test')
    await choose(user, 'Flag', /Checkout button/)
    await choose(user, 'Environment', 'Production')
    await user.clear(screen.getByLabelText('Traffic', { selector: '#exp-traffic' }))
    await user.type(screen.getByLabelText('Traffic', { selector: '#exp-traffic' }), '50')
    await user.type(screen.getByLabelText('Value', { selector: '#variant-0-value' }), 'blue')
    await user.type(screen.getByLabelText('Value', { selector: '#variant-1-value' }), 'green')
    await user.click(screen.getByRole('button', { name: 'Create experiment' }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    expect(mocks.post).toHaveBeenCalledWith('/experiments', {
      name: 'Checkout test',
      key: 'checkout-test',
      description: undefined,
      hypothesis: undefined,
      flagId: 'f1',
      environmentId: 'env-prod',
      trafficPercent: 50,
      variants: [
        { key: 'control', name: 'Control', value: 'blue', weight: 50, isControl: true },
        { key: 'variant_a', name: 'Variant A', value: 'green', weight: 50, isControl: false },
      ],
    })
    expect(toast.success).toHaveBeenCalledWith('Experiment "Checkout test" created')
    expect(screen.getByTestId('where')).toHaveTextContent(`/projects/${PROJECT}/experiments/e9`)
  })

  it('prefills boolean values for boolean flags and adds variants', async () => {
    const user = userEvent.setup()
    mocks.post.mockResolvedValue({ data: { id: 'e9', name: 'Header' } })
    renderPage()
    await user.type(await screen.findByLabelText('Name', { selector: '#exp-name' }), 'Header')
    await choose(user, 'Flag', /New header/)
    await choose(user, 'Environment', 'Development')
    await user.click(screen.getByRole('button', { name: 'Add variant' }))
    expect(screen.getByLabelText('Key', { selector: '#variant-2-key' })).toHaveValue('variant_b')
    await user.click(screen.getByRole('button', { name: 'Distribute evenly' }))
    await user.click(screen.getByRole('button', { name: 'Create experiment' }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    const body = mocks.post.mock.calls[0][1]
    expect(body.variants.map((v: { value: string; weight: number }) => [v.value, v.weight])).toEqual([
      ['false', 34],
      ['true', 33],
      ['true', 33],
    ])
  })

  it('shows the server error', async () => {
    const user = userEvent.setup()
    mocks.post.mockRejectedValue(axiosError(409, 'Key already exists'))
    renderPage()
    await user.type(await screen.findByLabelText('Name', { selector: '#exp-name' }), 'Header')
    await choose(user, 'Flag', /New header/)
    await choose(user, 'Environment', 'Development')
    await user.click(screen.getByRole('button', { name: 'Create experiment' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Key already exists'))
  })

  it('is read-only for viewers', async () => {
    mocks.role = 'VIEWER'
    renderPage()
    expect(await screen.findByText('No access')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create experiment' })).not.toBeInTheDocument()
  })

  it('shows an error when flags and environments fail to load', async () => {
    mocks.get.mockRejectedValue(axiosError(500))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Flags and environments of the project could not be loaded.')
  })

  it('reads the project from ?projectId= without the route param', async () => {
    render(
      <MemoryRouter initialEntries={[`/experiments/new?projectId=${PROJECT}`]}>
        <Routes>
          <Route path="/experiments/new" element={<CreateExperiment />} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByRole('heading', { level: 1, name: 'New experiment' })
    expect(mocks.get).toHaveBeenCalledWith(`/feature-flags/project/${PROJECT}`)
  })
})
