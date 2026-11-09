import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { resetSetupStatus } from '@/lib/setup'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({
  status: {
    setupRequired: true,
    mailEnabled: false,
    setupTokenRequired: false,
  },
  post: vi.fn(),
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  toastInfo: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: mocks.status })),
    post: mocks.post,
  },
}))
vi.mock('@/lib/workspace', () => ({ refreshWorkspace: mocks.refreshWorkspace }))
vi.mock('sonner', () => ({ toast: { info: mocks.toastInfo } }))

import Setup from './SetupPage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/projects" element={<div>project picker</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  )

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

async function fillForm(password = 'Secret123', confirm = password) {
  fill(/^name$/i, 'Ada Lovelace')
  fill(/e-?mail/i, 'ada@example.com')
  fill(/^passwort$|^password$/i, password)
  fill(/bestätigen|confirm/i, confirm)
  fill(/organisation|organization/i, 'Acme')
}

describe('Setup page', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetSetupStatus()
    mocks.status = {
      setupRequired: true,
      mailEnabled: false,
      setupTokenRequired: false,
    }
    mocks.post.mockReset()
    mocks.refreshWorkspace.mockClear()
    mocks.toastInfo.mockClear()
    useAuthStore.setState({ token: null, user: null })
    localStorage.clear()
  })

  it('rejects a password that violates the policy without calling the API', async () => {
    renderPage()
    await screen.findByLabelText(/^name$/i)
    await fillForm('alllowercase1')
    fireEvent.click(screen.getByRole('button', { name: /set up/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/uppercase/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('rejects mismatching passwords', async () => {
    renderPage()
    await screen.findByLabelText(/^name$/i)
    await fillForm('Secret123', 'Secret124')
    fireEvent.click(screen.getByRole('button', { name: /set up/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('hides the setup token field unless the server requires it', async () => {
    renderPage()
    await screen.findByLabelText(/^name$/i)
    expect(screen.queryByLabelText(/setup token/i)).toBeNull()
  })

  it('creates the instance, logs in and opens the project picker', async () => {
    mocks.status.setupTokenRequired = true
    mocks.post.mockResolvedValueOnce({
      data: {
        token: 'jwt',
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' },
      },
    })
    renderPage()
    await screen.findByLabelText(/setup token/i)
    await fillForm()
    fill(/setup token/i, 's3cret')
    fireEvent.click(screen.getByRole('button', { name: /set up/i }))

    expect(await screen.findByText('project picker')).toBeInTheDocument()
    expect(mocks.post).toHaveBeenCalledWith('/setup', {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Secret123',
      organizationName: 'Acme',
      setupToken: 's3cret',
    })
    expect(useAuthStore.getState().token).toBe('jwt')
    expect(mocks.refreshWorkspace).toHaveBeenCalled()
  })

  it('tells the user the instance is already set up before sending them to the login', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { message: 'x' } },
    })
    renderPage()
    await screen.findByLabelText(/^name$/i)
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: /set up/i }))

    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      i18n.t('setup.error-already-done')
    )
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('shows a clear error for a wrong setup token', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: { message: 'x' } },
    })
    renderPage()
    await screen.findByLabelText(/^name$/i)
    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: /set up/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/setup token/i)
    )
    expect(useAuthStore.getState().token).toBeNull()
  })
})
