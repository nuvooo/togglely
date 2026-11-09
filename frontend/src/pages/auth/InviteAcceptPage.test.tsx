import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  info: {
    organizationName: 'Acme',
    role: 'MEMBER',
    email: null as string | null,
    existingUser: false,
  },
  infoError: null as unknown,
  mailEnabled: false,
  get: vi.fn(),
  post: vi.fn(),
  refreshWorkspace: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, post: mocks.post },
}))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: mocks.refreshWorkspace,
  resetWorkspaceCache: vi.fn(),
}))

import InviteAccept from './InviteAcceptPage'

function Where() {
  const { pathname, search } = useLocation()
  return <div data-testid="where">{pathname + search}</div>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/invite/tok123']}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillAccount() {
  fill(/first name/i, 'Bob')
  fill(/last name/i, 'Builder')
  fill(/^password$/i, 'Secret123')
  fill(/confirm password/i, 'Secret123')
}

describe('InviteAccept', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    useAuthStore.setState({ token: null, user: null })
    localStorage.clear()
    mocks.info = {
      organizationName: 'Acme',
      role: 'MEMBER',
      email: null,
      existingUser: false,
    }
    mocks.infoError = null
    mocks.mailEnabled = false
    mocks.post.mockReset()
    mocks.refreshWorkspace.mockClear()
    mocks.get.mockReset()
    mocks.get.mockImplementation((url: string) => {
      if (url === '/auth/invite/tok123') {
        return mocks.infoError
          ? Promise.reject(mocks.infoError)
          : Promise.resolve({ data: mocks.info })
      }
      if (url === '/setup/status')
        return Promise.resolve({ data: { mailEnabled: mocks.mailEnabled } })
      if (url === '/organizations')
        return Promise.resolve({
          data: { organizations: [{ id: 'o1', name: 'Acme' }] },
        })
      return Promise.reject(new Error(`unexpected ${url}`))
    })
  })

  it('registers via an open link with a chosen email and opens the organization', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        token: 'jwt',
        user: { id: 'u2', email: 'bob@example.com', name: 'Bob Builder' },
        organizationId: 'o7',
      },
    })
    renderPage()
    expect(await screen.findByText('Join Acme')).toBeInTheDocument()
    expect(screen.getByText(/invited as member/i)).toBeInTheDocument()

    fill(/email address/i, 'bob@example.com')
    fillAccount()
    fireEvent.click(
      screen.getByRole('button', { name: /create account and join/i })
    )

    // The register response names the joined organization: no guessing via /organizations
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/orgs/o7/projects'
    )
    expect(mocks.get).not.toHaveBeenCalledWith('/organizations')
    expect(mocks.post).toHaveBeenCalledWith('/auth/invite/tok123/register', {
      firstName: 'Bob',
      lastName: 'Builder',
      password: 'Secret123',
      email: 'bob@example.com',
    })
    expect(useAuthStore.getState().token).toBe('jwt')
    expect(mocks.refreshWorkspace).toHaveBeenCalled()
  })

  it('uses the bound email of the invite and does not send one', async () => {
    mocks.info = { ...mocks.info, email: 'carol@example.com' }
    mocks.post.mockResolvedValueOnce({
      data: {
        token: 'jwt',
        user: { id: 'u3', email: 'carol@example.com', name: 'C' },
      },
    })
    renderPage()
    const email = await screen.findByLabelText(/email address/i)
    expect(email).toHaveValue('carol@example.com')
    expect(email).toHaveAttribute('readonly')

    fillAccount()
    fireEvent.click(
      screen.getByRole('button', { name: /create account and join/i })
    )
    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('email')
  })

  it('checks the password policy before registering', async () => {
    renderPage()
    await screen.findByText('Join Acme')
    fill(/email address/i, 'bob@example.com')
    fillAccount()
    fill(/^password$/i, 'short')
    fireEvent.click(
      screen.getByRole('button', { name: /create account and join/i })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('sends invitees with an existing account to the login with a return path', async () => {
    mocks.info = { ...mocks.info, email: 'dan@example.com', existingUser: true }
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: /sign in to join/i })
    )
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/login?next=%2Finvite%2Ftok123'
    )
  })

  it('offers the login link on the registration form', async () => {
    renderPage()
    const link = await screen.findByRole('link', {
      name: /already have an account/i,
    })
    expect(link).toHaveAttribute('href', '/login?next=%2Finvite%2Ftok123')
  })

  it('lets a logged-in user join directly', async () => {
    useAuthStore.setState({
      token: 'jwt',
      user: { id: 'u1', email: 'eve@example.com', name: 'Eve' },
    })
    mocks.post.mockResolvedValueOnce({
      data: { success: true, organizationId: 'o9' },
    })
    renderPage()
    expect(
      await screen.findByText(/signed in as eve@example.com/i)
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^join$/i }))
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/orgs/o9/projects'
    )
    expect(mocks.post).toHaveBeenCalledWith('/auth/invite/tok123/accept')
    expect(mocks.refreshWorkspace).toHaveBeenCalled()
  })

  it('blocks joining a bound invite with a different account', async () => {
    useAuthStore.setState({
      token: 'jwt',
      user: { id: 'u1', email: 'eve@example.com', name: 'Eve' },
    })
    mocks.info = {
      ...mocks.info,
      email: 'frank@example.com',
      existingUser: true,
    }
    renderPage()
    expect(
      await screen.findByText(/this invite is for frank@example.com/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^join$/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /different account/i })
    ).toBeInTheDocument()
  })

  it.each([
    [404, /invalid or has expired/i],
    [409, /already been used/i],
  ])('explains a %s invite error', async (status, message) => {
    mocks.infoError = {
      isAxiosError: true,
      response: { status, data: { message: 'x' } },
    }
    renderPage()
    expect(await screen.findByText(message)).toBeInTheDocument()
  })
})
