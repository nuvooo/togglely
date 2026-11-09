import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const mocks = vi.hoisted(() => ({
  role: 'OWNER',
  invites: [] as unknown[],
  others: [] as unknown[],
  get: vi.fn(),
  del: vi.fn(() => Promise.resolve({ data: { success: true } })),
}))
vi.mock('@/lib/axios', () => ({
  default: {
    get: mocks.get,
    delete: mocks.del,
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import OrgMembersPage from './OrgMembersPage'

const pending = {
  id: 'inv1',
  email: null,
  role: 'MEMBER',
  status: 'pending',
  createdAt: '2026-11-09T10:00:00.000Z',
  expiresAt: '2026-11-16T10:00:00.000Z',
  acceptedAt: null,
  revokedAt: null,
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/orgs/o1/members']}>
      <Routes>
        <Route path="/orgs/:orgId/members" element={<OrgMembersPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('OrgMembersPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    mocks.role = 'OWNER'
    mocks.others = []
    mocks.invites = [
      pending,
      { ...pending, id: 'inv2', email: 'bob@example.com', status: 'accepted' },
    ]
    mocks.del.mockClear()
    mocks.get.mockReset()
    mocks.get.mockImplementation((url: string) => {
      if (url === '/organizations/o1')
        return Promise.resolve({ data: { id: 'o1', name: 'Acme' } })
      if (url === '/organizations/o1/members')
        return Promise.resolve({
          data: {
            members: [
              {
                id: 'm1',
                userId: 'u1',
                email: 'ada@example.com',
                firstName: 'Ada',
                lastName: 'L',
                role: mocks.role,
                joinedAt: '',
              },
              ...mocks.others,
            ],
          },
        })
      if (url === '/auth/me')
        return Promise.resolve({ data: { user: { id: 'u1' } } })
      if (url === '/organizations/o1/invites')
        return Promise.resolve({ data: { invites: mocks.invites } })
      if (url === '/setup/status')
        return Promise.resolve({ data: { mailEnabled: false } })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
  })

  it('lists invites with open links and their status', async () => {
    renderPage()
    const table = (await screen.findByText('Open link')).closest(
      'table'
    ) as HTMLElement
    expect(within(table).getByText('Open link')).toBeInTheDocument()
    expect(within(table).getByText('bob@example.com')).toBeInTheDocument()
    expect(within(table).getByText('Pending')).toBeInTheDocument()
    expect(within(table).getByText('Accepted')).toBeInTheDocument()
    // Only pending invites can be revoked
    expect(
      within(table).getAllByRole('button', { name: /revoke/i })
    ).toHaveLength(1)
  })

  it('revokes an invite after confirmation and reloads the list', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke invite for Open link' })
    )
    const dialog = await screen.findByRole('dialog')
    mocks.invites = [{ ...pending, status: 'revoked' }]
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))

    await waitFor(() =>
      expect(mocks.del).toHaveBeenCalledWith('/organizations/o1/invites/inv1')
    )
    expect(await screen.findByText('Revoked')).toBeInTheDocument()
  })

  it('lets owners create a reset link for any member, including themselves', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Create password reset link for Ada L',
      })
    )
    expect(await screen.findByText(/valid for 1 hour/i)).toBeInTheDocument()
  })

  it('offers no reset links for other owners (server administrator only)', async () => {
    mocks.others = [
      {
        id: 'm2',
        userId: 'u2',
        email: 'bob@example.com',
        firstName: 'Bob',
        lastName: 'B',
        role: 'OWNER',
        joinedAt: '',
      },
      {
        id: 'm3',
        userId: 'u3',
        email: 'cy@example.com',
        firstName: 'Cy',
        lastName: 'C',
        role: 'MEMBER',
        joinedAt: '',
      },
    ]
    renderPage()
    expect(
      await screen.findByRole('button', {
        name: 'Create password reset link for Cy C',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Create password reset link for Ada L',
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Create password reset link for Bob B',
      })
    ).toBeNull()
  })

  it('offers no reset links to admins', async () => {
    mocks.role = 'ADMIN'
    renderPage()
    await screen.findByText('ada@example.com')
    expect(
      screen.queryByRole('button', { name: /password reset link/i })
    ).toBeNull()
  })

  it('hides invite management from viewers', async () => {
    mocks.role = 'VIEWER'
    renderPage()
    await screen.findByText('ada@example.com')
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull()
    expect(screen.getByRole('table', { name: 'Members' })).toBeInTheDocument()
    expect(screen.queryByText('Open link')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Invites' })).toBeNull()
    expect(mocks.get).not.toHaveBeenCalledWith('/organizations/o1/invites')
  })

  it('lists members with role in a table under the page header', async () => {
    mocks.others = [
      {
        id: 'm3',
        userId: 'u3',
        email: 'cy@example.com',
        firstName: 'Cy',
        lastName: 'C',
        role: 'VIEWER',
        joinedAt: '',
      },
    ]
    mocks.role = 'ADMIN'
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Members' })
    ).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Members' })
    const cy = within(table)
      .getByText('cy@example.com')
      .closest('tr') as HTMLElement
    expect(within(cy).getByText('Viewer')).toBeInTheDocument()
    // Admins remove non-owners but never themselves
    expect(
      within(cy).getByRole('button', { name: 'Remove Cy C' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Ada L' })).toBeNull()
  })

  it('removes a member after confirmation', async () => {
    mocks.others = [
      {
        id: 'm3',
        userId: 'u3',
        email: 'cy@example.com',
        firstName: 'Cy',
        lastName: 'C',
        role: 'MEMBER',
        joinedAt: '',
      },
    ]
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Cy C' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(mocks.del).toHaveBeenCalledWith('/organizations/o1/members/u3')
    )
    await waitFor(() => expect(screen.queryByText('cy@example.com')).toBeNull())
  })

  it('refetches the members (role source) after a 403', async () => {
    mocks.others = [
      {
        id: 'm3',
        userId: 'u3',
        email: 'cy@example.com',
        firstName: 'Cy',
        lastName: 'C',
        role: 'MEMBER',
        joinedAt: '',
      },
    ]
    mocks.del.mockImplementationOnce(() =>
      Promise.reject({ isAxiosError: true, response: { status: 403, data: {} } })
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Cy C' }))
    // Meanwhile the current user was demoted.
    mocks.role = 'VIEWER'
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(
        mocks.get.mock.calls.filter(
          ([url]) => url === '/organizations/o1/members'
        )
      ).toHaveLength(2)
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('cy@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Cy C' })).toBeNull()
  })

  it('shows a load error with retry', async () => {
    const original = mocks.get.getMockImplementation()!
    mocks.get.mockImplementation((url: string) =>
      url === '/organizations/o1/members'
        ? Promise.reject(new Error('down'))
        : original(url)
    )
    renderPage()
    expect(
      await screen.findByText('Could not load members.')
    ).toBeInTheDocument()
    mocks.get.mockImplementation(original)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
  })
})
