import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  mailEnabled: false,
  valid: true,
  get: vi.fn(),
  post: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }))

import ForgotPassword from './ForgotPassword'
import ResetPassword from './ResetPassword'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('password reset pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    useAuthStore.setState({ token: null, user: null })
    mocks.mailEnabled = false
    mocks.valid = true
    mocks.post.mockReset()
    mocks.toastSuccess.mockClear()
    mocks.get.mockReset()
    mocks.get.mockImplementation((url: string) => {
      if (url === '/setup/status') return Promise.resolve({ data: { mailEnabled: mocks.mailEnabled } })
      if (url === '/password-reset/validate') return Promise.resolve({ data: { valid: mocks.valid } })
      return Promise.reject(new Error(url))
    })
  })

  describe('/forgot-password', () => {
    it('explains the alternatives without a mail server', async () => {
      renderAt('/forgot-password')
      expect(await screen.findByText(/contact the owner of your organization/i)).toBeInTheDocument()
      expect(screen.getByText('node dist/cli reset-password <email>')).toBeInTheDocument()
      expect(screen.queryByLabelText(/email/i)).toBeNull()
      expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
    })

    it('requests a reset email with a mail server', async () => {
      mocks.mailEnabled = true
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/forgot-password')
      fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'a@b.c' } })
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
      expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
      expect(mocks.post).toHaveBeenCalledWith('/password-reset/request', { email: 'a@b.c' })
    })
  })

  describe('/reset-password', () => {
    const fillPasswords = (password: string, confirm = password) => {
      fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: password } })
      fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } })
      fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    }

    it('works without a mail server and returns to the login with a message', async () => {
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('Secret123')
      expect(await screen.findByText('login page')).toBeInTheDocument()
      expect(mocks.post).toHaveBeenCalledWith('/password-reset/reset', { token: 'tok', password: 'Secret123' })
      expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/password changed/i))
    })

    it('enforces the password policy', async () => {
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('secret123')
      expect(await screen.findByRole('alert')).toHaveTextContent(/uppercase/i)
      fillPasswords('Secret123', 'Secret124')
      expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
      expect(mocks.post).not.toHaveBeenCalled()
    })

    it('ends a local session after the reset', async () => {
      useAuthStore.setState({ token: 'jwt', user: { id: 'u', email: 'a@b.c', name: 'A' } })
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('Secret123')
      expect(await screen.findByText('login page')).toBeInTheDocument()
      expect(useAuthStore.getState().token).toBeNull()
    })

    it.each([
      ['an invalid token', '/reset-password?token=bad', false],
      ['a missing token', '/reset-password', true],
    ])('rejects %s', async (_, path, valid) => {
      mocks.valid = valid
      renderAt(path)
      expect(await screen.findByText(/invalid or expired link/i)).toBeInTheDocument()
      await waitFor(() => expect(mocks.post).not.toHaveBeenCalled())
    })
  })
})
