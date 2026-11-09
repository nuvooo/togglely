import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'

const mocks = vi.hoisted(() => ({
  mailEnabled: true,
  verifyError: null as unknown,
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, post: mocks.post },
}))

import ResendVerificationPage from './ResendVerificationPage'
import VerifyEmailPage from './VerifyEmailPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route
          path="/resend-verification"
          element={<ResendVerificationPage />}
        />
      </Routes>
    </MemoryRouter>
  )

describe('email verification pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    mocks.mailEnabled = true
    mocks.verifyError = null
    mocks.post.mockReset()
    mocks.get.mockReset()
    mocks.get.mockImplementation((url: string) => {
      if (url === '/setup/status')
        return Promise.resolve({ data: { mailEnabled: mocks.mailEnabled } })
      if (url.startsWith('/auth/verify-email/')) {
        return mocks.verifyError
          ? Promise.reject(mocks.verifyError)
          : Promise.resolve({ data: { message: 'ok' } })
      }
      return Promise.reject(new Error(url))
    })
  })

  it('verifies the token and leads to the login', async () => {
    renderAt('/verify-email/tok')
    expect(
      await screen.findByRole('heading', { level: 1, name: /email verified/i })
    ).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/auth/verify-email/tok')
    expect(
      screen.getByRole('link', { name: /continue to sign in/i })
    ).toHaveAttribute('href', '/login')
  })

  it('shows a failed verification as an alert and offers a new mail with a mail server', async () => {
    mocks.verifyError = {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Token expired' } },
    }
    renderAt('/verify-email/tok')
    expect(await screen.findByRole('alert')).toHaveTextContent('Token expired')
    expect(
      await screen.findByRole('link', { name: /new verification email/i })
    ).toHaveAttribute('href', '/resend-verification')
  })

  it('offers no resend link without a mail server', async () => {
    mocks.mailEnabled = false
    mocks.verifyError = {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Token expired' } },
    }
    renderAt('/verify-email/tok')
    await screen.findByRole('alert')
    await new Promise((r) => setTimeout(r, 0))
    expect(
      screen.queryByRole('link', { name: /new verification email/i })
    ).toBeNull()
  })

  it('resends a verification mail', async () => {
    mocks.post.mockResolvedValueOnce({ data: {} })
    renderAt('/resend-verification')
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: ' a@b.c ' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /send verification email/i })
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /check your email/i,
      })
    ).toBeInTheDocument()
    expect(mocks.post).toHaveBeenCalledWith('/auth/resend-verification', {
      email: 'a@b.c',
    })
  })

  it('shows a resend error inline', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, data: { message: 'Slow down' } },
    })
    renderAt('/resend-verification')
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /send verification email/i })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down')
  })
})
