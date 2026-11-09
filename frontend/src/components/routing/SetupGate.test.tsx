import { render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

const status = vi.hoisted(() => ({
  value: { setupRequired: false, mailEnabled: false, setupTokenRequired: false },
  fail: false,
}))
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url !== '/setup/status' || status.fail) return Promise.reject(new Error('down'))
      return Promise.resolve({ data: status.value })
    }),
  },
}))

import { GuestOnly, RequireMail, RequireSetupDone, SetupRoute } from './SetupGate'

function Where() {
  const { pathname, search } = useLocation()
  return <div data-testid="where">{pathname + search}</div>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/setup" element={<SetupRoute><div>setup page</div></SetupRoute>} />
        <Route
          path="/login"
          element={
            <RequireSetupDone>
              <GuestOnly>
                <div>login page</div>
              </GuestOnly>
            </RequireSetupDone>
          }
        />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/resend-verification" element={<RequireMail><div>resend page</div></RequireMail>} />
        <Route path="/" element={<RequireSetupDone><div>app</div></RequireSetupDone>} />
      </Routes>
      <Where />
    </MemoryRouter>
  )

describe('setup routing', () => {
  beforeEach(() => {
    resetSetupStatus()
    status.fail = false
    status.value = { setupRequired: false, mailEnabled: false, setupTokenRequired: false }
    useAuthStore.setState({ token: null, user: null })
  })
  afterEach(() => useAuthStore.setState({ token: null, user: null }))

  it.each(['/login', '/register', '/'])('sends %s to /setup on a fresh instance', async (path) => {
    status.value.setupRequired = true
    renderAt(path)
    expect(await screen.findByText('setup page')).toBeInTheDocument()
  })

  it('redirects /setup to /login once the instance is set up', async () => {
    renderAt('/setup')
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('redirects /setup to the project picker when logged in', async () => {
    useAuthStore.setState({ token: 't' })
    renderAt('/setup')
    expect(await screen.findByText('/projects')).toBeInTheDocument()
  })

  it('redirects /register to /login (registration is closed)', async () => {
    renderAt('/register')
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('treats an unreachable status endpoint as set up', async () => {
    status.fail = true
    renderAt('/login')
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('sends a logged-in user from /login to a safe next path', async () => {
    useAuthStore.setState({ token: 't' })
    renderAt('/login?next=%2Finvite%2Fabc')
    expect(await screen.findByText('/invite/abc')).toBeInTheDocument()
  })

  it('ignores an unsafe next path', async () => {
    useAuthStore.setState({ token: 't' })
    renderAt('/login?next=%2F%2Fevil.example')
    expect(await screen.findByText('/overview')).toBeInTheDocument()
  })

  it('hides mail-only pages without a mail server', async () => {
    renderAt('/resend-verification')
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('shows mail-only pages with a mail server', async () => {
    status.value.mailEnabled = true
    renderAt('/resend-verification')
    expect(await screen.findByText('resend page')).toBeInTheDocument()
  })
})
