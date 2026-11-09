import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: { success: true, organizationId: 'o1' } })),
  refreshWorkspace: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/axios', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('@/lib/workspace', () => ({ refreshWorkspace: mocks.refreshWorkspace }))

import PendingInvitesBanner from './PendingInvitesBanner'

describe('PendingInvitesBanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    mocks.post.mockClear()
    mocks.refreshWorkspace.mockClear()
    mocks.get.mockResolvedValue({
      data: {
        invites: [
          {
            id: 'inv1',
            // New invites only store a hash: the list carries no token
            token: null,
            organizationId: 'o1',
            organizationName: 'Acme',
            role: 'MEMBER',
            createdAt: '2026-11-09T10:00:00.000Z',
            expiresAt: '2026-11-16T10:00:00.000Z',
          },
        ],
      },
    })
  })

  it('accepts an invite via its id, not the token route', async () => {
    render(<PendingInvitesBanner />)
    expect(await screen.findByText("You've been invited to Acme")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /accept/i }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/auth/pending-invites/inv1/accept'))
    await waitFor(() => expect(screen.queryByText("You've been invited to Acme")).toBeNull())
    expect(mocks.refreshWorkspace).toHaveBeenCalled()
  })

  it('renders nothing without pending invites', async () => {
    mocks.get.mockResolvedValueOnce({ data: { invites: [] } })
    const { container } = render(<PendingInvitesBanner />)
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
