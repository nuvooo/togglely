import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(() =>
      Promise.resolve({ data: { featureFlag: { id: 'f1', projectId: 'p1' } } })
    ),
  },
}))

import { LegacyFlagRedirect, ParamRedirect } from './LegacyRedirects'
import { ProjectQueryBridge } from './ProjectQueryBridge'

function Where() {
  const { pathname, search } = useLocation()
  return <div data-testid="where">{pathname + search}</div>
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
    expect(screen.getByTestId('where')).toHaveTextContent('/orgs/o1/members')
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
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/projects/p1/flags/f1'
      )
    )
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
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/projects/p1/experiments?projectId=p1'
    )
  })
})
