import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useThemeStore } from '@/store/themeStore'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { user: { email: 'a@b.c', firstName: 'Ada', lastName: 'L' } } })),
  },
}))

import Settings from './Settings'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Settings />
    </MemoryRouter>
  )

describe('Settings (account)', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    i18n.changeLanguage('de')
  })

  it('has profile, security and appearance anchors', async () => {
    const { container } = renderAt('/account')
    await screen.findByLabelText(/vorname|first name/i)
    for (const id of ['profile', 'security', 'appearance']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('scrolls to the section in the hash', async () => {
    const { container } = renderAt('/account#appearance')
    await screen.findByLabelText(/vorname|first name/i)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]).toBe(container.querySelector('#appearance'))
  })

  it('switches theme and language in the appearance section', async () => {
    renderAt('/account#appearance')
    await screen.findByLabelText(/vorname|first name/i)
    fireEvent.click(screen.getByRole('radio', { name: /dunkel|dark/i }))
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(screen.getByRole('radio', { name: /dunkel|dark/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /^english$/i }))
    expect(i18n.resolvedLanguage).toBe('en')
  })
})
