import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

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

import Login from './Login'

function Where() {
  const { pathname } = useLocation()
  return <div data-testid="where">{pathname}</div>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

async function signIn() {
  fireEvent.change(screen.getByLabelText(/e-?mail/i), { target: { value: 'a@b.c' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('Login', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    mocks.status = { setupRequired: false, mailEnabled: false, setupTokenRequired: false }
    mocks.post.mockReset()
    mocks.post.mockResolvedValue({ data: { token: 't', user: { id: 'u', email: 'a@b.c', name: 'A' } } })
    useAuthStore.setState({ token: null, user: null })
  })

  it('has no sign-up link and tells users to ask for an invite', () => {
    renderAt('/login')
    expect(screen.queryByRole('link', { name: /sign up|register/i })).toBeNull()
    expect(screen.getByText(/ask an admin to invite you/i)).toBeInTheDocument()
  })

  it('returns to a safe next path after login', async () => {
    renderAt('/login?next=%2Finvite%2Fabc')
    await signIn()
    expect(await screen.findByTestId('where')).toHaveTextContent('/invite/abc')
  })

  it('ignores an external next target', async () => {
    renderAt('/login?next=%2F%2Fevil.example%2Fx')
    await signIn()
    expect(await screen.findByTestId('where')).toHaveTextContent('/overview')
  })

  it('offers password reset only with a mail server', async () => {
    mocks.status.mailEnabled = true
    renderAt('/login')
    expect(await screen.findByRole('link', { name: /forgot/i })).toBeInTheDocument()
  })

  it('hides password reset without a mail server', async () => {
    renderAt('/login')
    await screen.findByLabelText(/^password$/i)
    expect(screen.queryByRole('link', { name: /forgot/i })).toBeNull()
  })
})
