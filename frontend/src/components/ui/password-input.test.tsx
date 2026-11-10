import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { PasswordInput } from './password-input'

describe('PasswordInput', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('hides the password by default', () => {
    render(<PasswordInput aria-label="Password" defaultValue="secret" />)
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password'
    )
    expect(
      screen.getByRole('button', { name: 'Show password' })
    ).toBeInTheDocument()
  })

  it('toggles visibility on click', async () => {
    render(<PasswordInput aria-label="Password" defaultValue="secret" />)
    const input = screen.getByLabelText('Password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(
      screen.getByRole('button', { name: 'Hide password' })
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('does not submit the surrounding form', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Password" />
      </form>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('passes input props through', () => {
    render(
      <PasswordInput
        aria-label="Password"
        id="pw"
        autoComplete="new-password"
        required
      />
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('id', 'pw')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toBeRequired()
  })
})
