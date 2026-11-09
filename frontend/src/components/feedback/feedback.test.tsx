import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

describe('feedback states', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
  })

  it('EmptyState shows title, text and action', () => {
    render(
      <EmptyState
        title="Noch keine Flags"
        description="Lege dein erstes Flag an."
        action={<button type="button">Neues Flag</button>}
      />
    )
    expect(screen.getByText('Noch keine Flags')).toBeInTheDocument()
    expect(screen.getByText('Lege dein erstes Flag an.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Neues Flag' })
    ).toBeInTheDocument()
  })

  it('ErrorState announces the error and retries', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ErrorState
        message="Die Flags konnten nicht geladen werden."
        onRetry={onRetry}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Flags konnten nicht geladen werden.'
    )
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('ErrorState hides the retry button without onRetry', () => {
    render(<ErrorState message="Fehler" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
