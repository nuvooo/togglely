import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: mocks.get, patch: mocks.patch, post: mocks.post },
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))

import AccountPage from './AccountPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountPage />
    </MemoryRouter>
  )

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('AccountPage', () => {
  const scrollIntoView = vi.fn()
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
    mocks.get.mockReset()
    mocks.get.mockResolvedValue({
      data: { user: { email: 'a@b.c', firstName: 'Ada', lastName: 'L' } },
    })
    mocks.patch.mockReset()
    mocks.post.mockReset()
    mocks.toastSuccess.mockClear()
    useAuthStore.setState({
      token: 'old',
      user: { id: 'u', email: 'a@b.c', name: 'Ada L' },
    })
  })
  afterEach(() => {
    i18n.changeLanguage('de')
  })

  it('has profile, security and appearance anchors', async () => {
    const { container } = renderAt('/account')
    await screen.findByLabelText(/first name/i)
    for (const id of ['profile', 'security', 'appearance']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(
      screen.getByRole('heading', { level: 1, name: /account/i })
    ).toBeInTheDocument()
  })

  it('scrolls to the section in the hash', async () => {
    const { container } = renderAt('/account#appearance')
    await screen.findByLabelText(/first name/i)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(
      scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]
    ).toBe(container.querySelector('#appearance'))
  })

  it('shows the email read-only and saves the name', async () => {
    mocks.patch.mockResolvedValueOnce({
      data: { user: { firstName: 'Ada', lastName: 'Lovelace' } },
    })
    renderAt('/account')
    const email = await screen.findByLabelText(/^email$/i)
    expect(email).toHaveValue('a@b.c')
    expect(email).toHaveAttribute('readonly')

    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
    fill(/last name/i, 'Lovelace')
    fireEvent.click(save)
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/auth/profile', {
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
    )
    await waitFor(() =>
      expect(useAuthStore.getState().user?.name).toBe('Ada Lovelace')
    )
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it('offers a retry when the profile cannot be loaded and keeps the other sections usable', async () => {
    mocks.get.mockRejectedValueOnce(new Error('down'))
    renderAt('/account')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /failed to load profile/i
    )
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(await screen.findByLabelText(/first name/i)).toHaveValue('Ada')
  })

  it('explains that other sessions end and keeps this one with the new token', async () => {
    mocks.post.mockResolvedValueOnce({ data: { token: 'fresh' } })
    renderAt('/account#security')
    await screen.findByLabelText(/first name/i)
    expect(screen.getByText(/other devices/i)).toBeInTheDocument()

    fill(/current password/i, 'Old12345')
    fill(/^new password$/i, 'Secret123')
    fill(/confirm new password/i, 'Secret123')
    fireEvent.click(screen.getByRole('button', { name: /^change password$/i }))
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'Old12345',
        newPassword: 'Secret123',
      })
    )
    await waitFor(() => expect(useAuthStore.getState().token).toBe('fresh'))
    expect(screen.getByLabelText(/current password/i)).toHaveValue('')
  })

  it('checks the password policy and confirmation before calling the API', async () => {
    renderAt('/account')
    await screen.findByLabelText(/first name/i)
    fill(/current password/i, 'Old12345')
    fill(/^new password$/i, 'secret123')
    fill(/confirm new password/i, 'secret123')
    fireEvent.click(screen.getByRole('button', { name: /^change password$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/uppercase/i)

    fill(/^new password$/i, 'Secret123')
    fill(/confirm new password/i, 'Secret124')
    fireEvent.click(screen.getByRole('button', { name: /^change password$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('shows a failed password change inline', async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Current password is incorrect',
          code: 'WRONG_CURRENT_PASSWORD',
        },
      },
    })
    renderAt('/account')
    await screen.findByLabelText(/first name/i)
    fill(/current password/i, 'Wrong123')
    fill(/^new password$/i, 'Secret123')
    fill(/confirm new password/i, 'Secret123')
    fireEvent.click(screen.getByRole('button', { name: /^change password$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Current password is incorrect'
    )
  })

  it('translates a wrong current password instead of showing the server text', async () => {
    await i18n.changeLanguage('de')
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: 'Current password is incorrect',
          code: 'WRONG_CURRENT_PASSWORD',
        },
      },
    })
    renderAt('/account')
    await screen.findByLabelText(/vorname/i)
    fill(/aktuelles passwort/i, 'Wrong123')
    fill(/^neues passwort$/i, 'Secret123')
    fill(/neues passwort bestätigen/i, 'Secret123')
    fireEvent.click(screen.getByRole('button', { name: /^passwort ändern$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das aktuelle Passwort ist falsch'
    )
  })

  it('switches theme and language in the appearance section', async () => {
    renderAt('/account#appearance')
    await screen.findByLabelText(/first name/i)
    fireEvent.click(screen.getByRole('radio', { name: /^dark$/i }))
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(screen.getByRole('radio', { name: /^dark$/i })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.click(screen.getByRole('radio', { name: /^deutsch$/i }))
    expect(i18n.resolvedLanguage).toBe('de')
  })
})
