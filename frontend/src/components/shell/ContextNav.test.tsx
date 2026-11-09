import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [
      { id: 'p1', name: 'Shop', key: 'shop', type: 'MULTI', organizationId: 'o1' },
      { id: 'p2', name: 'Blog', key: 'blog', type: 'SINGLE', organizationId: 'o1' },
    ],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import { ContextNav } from './ContextNav'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ContextNav />
    </MemoryRouter>
  )

describe('ContextNav', () => {
  it('shows project sections incl. brands for MULTI projects', () => {
    renderAt('/projects/p1/flags')
    expect(screen.getByRole('link', { name: /feature flags/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /brands/i })).toHaveAttribute('href', '/projects/p1/brands')
    expect(screen.getByText('Shop')).toBeInTheDocument()
  })

  it('lists webhooks in the develop group between SDK tester and settings', () => {
    renderAt('/projects/p1/webhooks/w1')
    const webhooks = screen.getByRole('link', { name: 'Webhooks' })
    expect(webhooks).toHaveAttribute('href', '/projects/p1/webhooks')
    expect(webhooks).toHaveAttribute('aria-current', 'page')
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.slice(-3)).toEqual(['/projects/p1/sdk', '/projects/p1/webhooks', '/projects/p1/settings'])
  })

  it('hides brands for SINGLE projects', () => {
    renderAt('/projects/p2/flags')
    expect(screen.queryByRole('link', { name: /brands/i })).toBeNull()
  })

  it('shows organization sections', () => {
    renderAt('/orgs/o1/members')
    expect(screen.getByRole('link', { name: /audit log/i })).toHaveAttribute('href', '/orgs/o1/audit-log')
    expect(screen.getByRole('link', { name: /mitglieder|members/i })).toHaveAttribute('aria-current', 'page')
  })

  it('renders nothing on the overview', () => {
    const { container } = renderAt('/overview')
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ContextNav landmarks', () => {
  it('exposes a labelled navigation landmark', () => {
    renderAt('/projects/p1/flags')
    expect(screen.getByRole('navigation', { name: /bereichsnavigation|section navigation/i })).toBeInTheDocument()
  })

  it('renders nothing on the project picker', () => {
    const { container } = renderAt('/projects')
    expect(container).toBeEmptyDOMElement()
  })

  it('links account sections to their anchors', () => {
    renderAt('/account')
    expect(screen.getByRole('link', { name: /sicherheit|security/i })).toHaveAttribute('href', '/account#security')
    expect(screen.getByRole('link', { name: /darstellung|appearance/i })).toHaveAttribute('href', '/account#appearance')
  })
})
