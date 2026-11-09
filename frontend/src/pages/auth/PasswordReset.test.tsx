import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, post: mocks.post },
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))

import ForgotPassword from './ForgotPasswordPage'
import ResetPassword from './ResetPasswordPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
      <LocationProbe />
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
      if (url === '/setup/status')
        return Promise.resolve({ data: { mailEnabled: mocks.mailEnabled } })
      if (url === '/password-reset/validate')
        return Promise.resolve({ data: { valid: mocks.valid } })
      return Promise.reject(new Error(url))
    })
  })

  describe('/forgot-password', () => {
    it('explains the alternatives without a mail server', async () => {
      renderAt('/forgot-password')
      expect(
        await screen.findByText(/contact the owner of your organization/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText('node dist/cli reset-password <email>')
      ).toBeInTheDocument()
      expect(screen.queryByLabelText(/email/i)).toBeNull()
      expect(
        screen.getByRole('link', { name: /back to sign in/i })
      ).toHaveAttribute('href', '/login')
    })

    it('offers a retry instead of guessing when the status cannot be loaded', async () => {
      let failing = true
      mocks.get.mockImplementation((url: string) => {
        if (url === '/setup/status') {
          return failing
            ? Promise.reject(new Error('down'))
            : Promise.resolve({ data: { mailEnabled: true } })
        }
        return Promise.reject(new Error(url))
      })
      renderAt('/forgot-password')
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /could not reach the server/i
      )
      expect(
        screen.queryByText(/contact the owner of your organization/i)
      ).toBeNull()
      expect(screen.queryByLabelText(/email/i)).toBeNull()

      failing = false
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    })

    it('requests a reset email with a mail server', async () => {
      mocks.mailEnabled = true
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/forgot-password')
      fireEvent.change(await screen.findByLabelText(/email/i), {
        target: { value: 'a@b.c' },
      })
      fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
      expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
      expect(mocks.post).toHaveBeenCalledWith('/password-reset/request', {
        email: 'a@b.c',
      })
    })
  })

  describe('/reset-password', () => {
    const fillPasswords = (password: string, confirm = password) => {
      fireEvent.change(screen.getByLabelText(/new password/i), {
        target: { value: password },
      })
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: confirm },
      })
      fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    }

    it('works without a mail server and returns to the login with a message', async () => {
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('Secret123')
      expect(await screen.findByText('login page')).toBeInTheDocument()
      expect(mocks.post).toHaveBeenCalledWith('/password-reset/reset', {
        token: 'tok',
        password: 'Secret123',
      })
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/password changed/i)
      )
    })

    it('enforces the password policy', async () => {
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('secret123')
      expect(await screen.findByRole('alert')).toHaveTextContent(/uppercase/i)
      fillPasswords('Secret123', 'Secret124')
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /do not match/i
      )
      expect(mocks.post).not.toHaveBeenCalled()
    })

    it('removes the token from the URL but still uses it', async () => {
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/reset-password$/
      )
      fillPasswords('Secret123')
      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith('/password-reset/reset', {
          token: 'tok',
          password: 'Secret123',
        })
      )
    })

    it('keeps a local session after the reset and offers to continue', async () => {
      useAuthStore.setState({
        token: 'jwt',
        user: { id: 'u', email: 'a@b.c', name: 'A' },
      })
      mocks.post.mockResolvedValueOnce({ data: { success: true } })
      renderAt('/reset-password?token=tok')
      await screen.findByLabelText(/new password/i)
      fillPasswords('Secret123')
      expect(
        await screen.findByRole('heading', { name: /password changed/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
        'href',
        '/overview'
      )
      expect(screen.queryByText('login page')).toBeNull()
      expect(useAuthStore.getState().token).toBe('jwt')
    })

    it('points a logged-in user to the account security section for a new link', async () => {
      useAuthStore.setState({
        token: 'jwt',
        user: { id: 'u', email: 'a@b.c', name: 'A' },
      })
      mocks.valid = false
      renderAt('/reset-password?token=bad')
      expect(
        await screen.findByRole('link', { name: /request a new link/i })
      ).toHaveAttribute('href', '/account#security')
    })

    it('points a guest to the forgot password page for a new link', async () => {
      mocks.valid = false
      renderAt('/reset-password?token=bad')
      expect(
        await screen.findByRole('link', { name: /request a new link/i })
      ).toHaveAttribute('href', '/forgot-password')
    })

    it.each([
      ['an invalid token', '/reset-password?token=bad', false],
      ['a missing token', '/reset-password', true],
    ])('rejects %s', async (_, path, valid) => {
      mocks.valid = valid
      renderAt(path)
      expect(
        await screen.findByText(/invalid or expired link/i)
      ).toBeInTheDocument()
      await waitFor(() => expect(mocks.post).not.toHaveBeenCalled())
    })
  })
})
