import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

const PROJECT_ID = '0123456789abcdef01234567'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn((url: string) =>
      Promise.resolve({
        data: url.startsWith('/projects/')
          ? { project: { id: PROJECT_ID, name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' } }
          : { featureFlags: [] },
      })
    ),
  },
}))

import ProjectDetail from './ProjectDetail'

function Search() {
  return <div data-testid="search">{useLocation().search}</div>
}

describe('ProjectDetail', () => {
  it('opens the create-flag dialog for ?new=1 and removes the param', async () => {
    render(
      <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/flags?new=1`]}>
        <Routes>
          <Route
            path="/projects/:projectId/flags"
            element={
              <>
                <ProjectDetail />
                <Search />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Flag Name')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('search').textContent).not.toContain('new=1'))
  })
})
