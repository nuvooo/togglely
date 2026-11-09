import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/axios', () => ({ default: api }))

import OrgListPage from './OrgListPage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/orgs']}>
      <Routes>
        <Route path="/orgs" element={<OrgListPage />} />
        <Route path="/orgs/new" element={<p>new org</p>} />
        <Route path="/orgs/:orgId/projects" element={<p>org projects</p>} />
      </Routes>
    </MemoryRouter>
  )

describe('OrgListPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    api.get.mockReset()
  })

  it('lists organizations with role and counts', async () => {
    api.get.mockResolvedValue({
      data: {
        organizations: [
          {
            id: 'o1',
            name: 'Acme',
            role: 'OWNER',
            projectCount: 3,
            memberCount: 5,
          },
          {
            id: 'o2',
            name: 'Globex',
            role: 'VIEWER',
            projectCount: 1,
            memberCount: 9,
          },
        ],
      },
    })
    renderPage()
    const table = await screen.findByRole('table', { name: 'Organizations' })
    const acme = within(table)
      .getByRole('link', { name: 'Acme' })
      .closest('tr') as HTMLElement
    expect(within(acme).getByText('Owner')).toBeInTheDocument()
    expect(within(acme).getByText('3')).toBeInTheDocument()
    expect(within(acme).getByText('5')).toBeInTheDocument()
    expect(within(table).getByText('Viewer')).toBeInTheDocument()
    await userEvent.setup().click(within(acme).getByText('Owner'))
    expect(await screen.findByText('org projects')).toBeInTheDocument()
  })

  it('offers creating the first organization', async () => {
    api.get.mockResolvedValue({ data: { organizations: [] } })
    renderPage()
    expect(await screen.findByText('No organizations yet')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'New organization' }))
    expect(await screen.findByText('new org')).toBeInTheDocument()
  })

  it('shows a load error with retry', async () => {
    api.get.mockRejectedValueOnce(new Error('down')).mockResolvedValue({
      data: { organizations: [{ id: 'o1', name: 'Acme', role: 'OWNER' }] },
    })
    renderPage()
    expect(
      await screen.findByText('The organizations could not be loaded.')
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('link', { name: 'Acme' })
    ).toBeInTheDocument()
  })
})
