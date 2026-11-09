import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url === '/feature-flags/f1') {
        return Promise.resolve({ data: { featureFlag: { id: 'f1', projectId: 'p1' } } })
      }
      if (url === '/experiments/e1') {
        return Promise.resolve({ data: { id: 'e1', projectId: 'p2' } })
      }
      return Promise.reject(new Error('not found'))
    }),
  },
}))

import {
  LegacyExperimentRedirect,
  LegacyExperimentsRedirect,
  LegacyFlagRedirect,
  ParamRedirect,
} from './LegacyRedirects'
import { ProjectQueryBridge } from './ProjectQueryBridge'

function Where() {
  const { pathname, search, hash } = useLocation()
  return <div data-testid="where">{pathname + search + hash}</div>
}

function LegacyExperimentRoutes({ url }: { url: string }) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/experiments" element={<LegacyExperimentsRedirect />} />
        <Route path="/experiments/new" element={<LegacyExperimentsRedirect create />} />
        <Route path="/experiments/:id" element={<LegacyExperimentRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('legacy redirects', () => {
  it('maps params into a new path', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/o1/members']}>
        <Routes>
          <Route
            path="/organizations/:orgId/members"
            element={<ParamRedirect to="/orgs/:orgId/members" />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/orgs\/o1\/members$/)
  })

  it('keeps query string and hash when mapping params', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/o1/members?tab=invites#pending']}>
        <Routes>
          <Route
            path="/organizations/:orgId/members"
            element={<ParamRedirect to="/orgs/:orgId/members" />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/orgs/o1/members?tab=invites#pending')
  })

  it('resolves the project of an old flag link', async () => {
    render(
      <MemoryRouter initialEntries={['/feature-flags/f1']}>
        <Routes>
          <Route path="/feature-flags/:id" element={<LegacyFlagRedirect />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/projects/p1/flags/f1')
    )
  })

  it('sends old experiment lists with a project to the project', () => {
    render(<LegacyExperimentRoutes url="/experiments?projectId=p1" />)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/projects\/p1\/experiments$/)
  })

  it('sends old experiment lists without a project to the overview', () => {
    render(<LegacyExperimentRoutes url="/experiments" />)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/overview$/)
  })

  it('sends old create-experiment links to the project', () => {
    render(<LegacyExperimentRoutes url="/experiments/new?projectId=p1" />)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/projects\/p1\/experiments\/new$/)
  })

  it('sends old create-experiment links without a project to the overview', () => {
    render(<LegacyExperimentRoutes url="/experiments/new" />)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/overview$/)
  })

  it('resolves the project of an old experiment link', async () => {
    render(<LegacyExperimentRoutes url="/experiments/e1" />)
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/projects\/p2\/experiments\/e1$/)
    )
  })

  it('falls back to the overview for unknown experiments', async () => {
    render(<LegacyExperimentRoutes url="/experiments/missing" />)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/overview$/))
  })

  it('adds projectId as query param for legacy pages', () => {
    render(
      <MemoryRouter initialEntries={['/projects/p1/experiments']}>
        <Routes>
          <Route
            path="/projects/:projectId/experiments"
            element={
              <ProjectQueryBridge>
                <Where />
              </ProjectQueryBridge>
            }
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/projects/p1/experiments?projectId=p1')
  })
})
