import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  status: {
    setupRequired: false,
    mailEnabled: false,
    setupTokenRequired: false,
  },
  post: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: mocks.status })),
    post: mocks.post,
  },
}))

import Login from './LoginPage'

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
  fireEvent.change(screen.getByLabelText(/e-?mail/i), {
    target: { value: 'a@b.c' },
  })
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: 'pw' },
  })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('Login', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    mocks.status = {
      setupRequired: false,
      mailEnabled: false,
      setupTokenRequired: false,
    }
    mocks.post.mockReset()
    mocks.post.mockResolvedValue({
      data: { token: 't', user: { id: 'u', email: 'a@b.c', name: 'A' } },
    })
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

  it('always offers "forgot password", also without a mail server', () => {
    renderAt('/login')
    expect(screen.getByRole('link', { name: /forgot/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('has no dead links', () => {
    const { container } = renderAt('/login')
    expect(container.querySelector('a[href="#"]')).toBeNull()
  })

  it('shows the demo credentials only with ?demo=true', () => {
    const { unmount } = renderAt('/login')
    expect(screen.queryByText('demo@togglely.io')).toBeNull()
    expect(screen.getByLabelText(/e-?mail/i)).toHaveValue('')
    unmount()

    renderAt('/login?demo=true')
    expect(screen.getByText('demo@togglely.io')).toBeInTheDocument()
    expect(screen.getByLabelText(/e-?mail/i)).toHaveValue('demo@togglely.io')
  })

  it('shows wrong credentials as an inline alert and stays on the page', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { message: 'x' } },
    })
    renderAt('/login')
    await signIn()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /invalid credentials/i
    )
    expect(screen.queryByTestId('where')).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: /welcome back/i })
    ).toBeInTheDocument()
  })
})
