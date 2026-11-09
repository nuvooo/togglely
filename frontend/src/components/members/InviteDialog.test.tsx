import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'

const mocks = vi.hoisted(() => ({
  status: { setupRequired: false, mailEnabled: false, setupTokenRequired: false },
  post: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: mocks.status })),
    post: mocks.post,
  },
}))

import { InviteDialog } from './InviteDialog'

const URL = 'http://localhost:3000/invite/abc123'
const expiresAt = '2026-11-16T12:00:00.000Z'

const renderDialog = (onCreated = vi.fn()) => {
  render(
    <InviteDialog
      orgId="org1"
      orgName="Acme"
      actorRole="OWNER"
      open
      onOpenChange={() => {}}
      onCreated={onCreated}
    />
  )
  return onCreated
}

describe('InviteDialog', () => {
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    mocks.status = { setupRequired: false, mailEnabled: false, setupTokenRequired: false }
    mocks.post.mockReset()
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  it('warns that an open link lets the recipient choose any email', () => {
    renderDialog()
    expect(screen.getByTestId('open-link-warning')).toHaveTextContent(/any email address/i)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bob@example.com' } })
    expect(screen.queryByTestId('open-link-warning')).toBeNull()
  })

  it('creates an open link, shows it and copies it', async () => {
    mocks.post.mockResolvedValueOnce({
      data: { invite: { id: 'i1', email: null, role: 'MEMBER', expiresAt }, inviteUrl: URL, emailSent: false },
    })
    const onCreated = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    const link = await screen.findByLabelText(/invite link/i)
    expect(link).toHaveValue(URL)
    expect(mocks.post).toHaveBeenCalledWith('/organizations/org1/invites', { role: 'MEMBER' })
    expect(onCreated).toHaveBeenCalled()
    expect(screen.getByTestId('invite-delivery')).toHaveTextContent(/share this link/i)

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('tells the admin to share the link when no mail server is configured', async () => {
    mocks.post.mockResolvedValueOnce({
      data: { invite: { id: 'i2', email: 'bob@example.com', role: 'MEMBER', expiresAt }, inviteUrl: URL, emailSent: false },
    })
    renderDialog()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: ' bob@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    expect(await screen.findByTestId('invite-delivery')).toHaveTextContent(/no mail server/i)
    expect(mocks.post).toHaveBeenCalledWith('/organizations/org1/invites', {
      role: 'MEMBER',
      email: 'bob@example.com',
    })
  })

  it('confirms when the link was mailed', async () => {
    mocks.status.mailEnabled = true
    mocks.post.mockResolvedValueOnce({
      data: { invite: { id: 'i3', email: 'bob@example.com', role: 'VIEWER', expiresAt }, inviteUrl: URL, emailSent: true },
    })
    renderDialog()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bob@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    expect(await screen.findByTestId('invite-delivery')).toHaveTextContent('The link was sent to bob@example.com.')
  })

  it('shows API errors in the form', async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { message: 'User is already a member' } } })
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('User is already a member')
  })
})
