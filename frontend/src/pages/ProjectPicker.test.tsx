import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const state = vi.hoisted(() => ({
  value: {
    projects: [] as unknown[],
    organizations: [] as unknown[],
    isLoading: false,
    error: null as unknown,
  },
}))
const refreshWorkspace = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({ ...state.value, projectsByOrg: () => [] }),
  refreshWorkspace,
}))

import ProjectPicker from './ProjectPicker'

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProjectPicker />
    </MemoryRouter>
  )

describe('ProjectPicker', () => {
  beforeEach(() => {
    refreshWorkspace.mockClear()
    state.value = {
      projects: [],
      organizations: [],
      isLoading: false,
      error: null,
    }
  })

  it('lists projects grouped by organization', () => {
    state.value = {
      ...state.value,
      organizations: [
        { id: 'o1', name: 'Acme' },
        { id: 'o2', name: 'Globex' },
      ],
      projects: [
        {
          id: 'p1',
          name: 'Shop',
          key: 'shop',
          type: 'SINGLE',
          organizationId: 'o1',
        },
        {
          id: 'p2',
          name: 'Blog',
          key: 'blog',
          type: 'SINGLE',
          organizationId: 'o2',
        },
      ],
    }
    renderPage()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /projekt wählen|select project/i,
      })
    ).toBeInTheDocument()
    const acme = screen.getByRole('region', { name: 'Acme' })
    const shop = within(acme).getByRole('link', { name: /shop/i })
    expect(shop).toHaveAttribute('href', '/projects/p1/flags')
    expect(within(acme).queryByRole('link', { name: /blog/i })).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Globex' })).getByRole('link', {
        name: /blog/i,
      })
    ).toHaveAttribute('href', '/projects/p2/flags')
  })

  it('shows a loading skeleton', () => {
    state.value = { ...state.value, isLoading: true }
    renderPage()
    expect(screen.getByLabelText(/laden|loading/i)).toHaveAttribute(
      'aria-busy',
      'true'
    )
  })

  it('shows an empty state linking to organizations', () => {
    renderPage()
    expect(
      screen.getByText(/noch keine projekte|no projects yet/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /organisationen|organizations/i })
    ).toHaveAttribute('href', '/orgs')
  })

  it('shows an error with retry', () => {
    state.value = { ...state.value, error: new Error('boom') }
    renderPage()
    expect(
      screen.queryByText(/noch keine projekte|no projects yet/i)
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: /erneut versuchen|retry/i })
    )
    expect(refreshWorkspace).toHaveBeenCalledTimes(1)
  })
})
