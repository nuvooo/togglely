import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { PageToolbar } from './PageToolbar'

describe('PageToolbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
  })

  describe('search', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('reports the search text debounced, once per pause', () => {
      const onSearch = vi.fn()
      render(
        <PageToolbar onSearch={onSearch} searchPlaceholder="Flags suchen" />
      )
      const input = screen.getByRole('searchbox', { name: 'Flags suchen' })

      fireEvent.change(input, { target: { value: 'da' } })
      act(() => vi.advanceTimersByTime(100))
      fireEvent.change(input, { target: { value: 'dark' } })
      act(() => vi.advanceTimersByTime(249))
      expect(onSearch).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(1))
      expect(onSearch).toHaveBeenCalledTimes(1)
      expect(onSearch).toHaveBeenCalledWith('dark')
    })

    it('does not report the initial value and clears immediately', () => {
      const onSearch = vi.fn()
      render(
        <PageToolbar
          onSearch={onSearch}
          defaultSearch="dark"
          searchDelay={300}
        />
      )
      act(() => vi.advanceTimersByTime(500))
      expect(onSearch).not.toHaveBeenCalled()

      const input = screen.getByRole('searchbox', { name: 'Suchen …' })
      expect(input).toHaveValue('dark')
      fireEvent.click(screen.getByRole('button', { name: 'Suche leeren' }))
      expect(onSearch).toHaveBeenCalledWith('')
      expect(input).toHaveValue('')
      act(() => vi.advanceTimersByTime(500))
      expect(onSearch).toHaveBeenCalledTimes(1)
    })

    it('clears with Escape', () => {
      const onSearch = vi.fn()
      render(<PageToolbar onSearch={onSearch} defaultSearch="x" />)
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
      expect(onSearch).toHaveBeenCalledWith('')
    })
  })

  it('has no search field without onSearch', () => {
    render(<PageToolbar actions={<button type="button">Neu</button>} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Neu' })).toBeInTheDocument()
  })

  it('renders filter chips with state and count and reports clicks', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    render(
      <PageToolbar
        filters={[
          { id: 'all', label: 'Alle', count: 12, active: true },
          { id: 'on', label: 'Aktiv', count: 3, active: false },
          { id: 'string', label: 'STRING', active: false },
        ]}
        onFilterChange={onFilterChange}
      />
    )
    expect(screen.getByRole('group', { name: 'Filter' })).toBeInTheDocument()
    const all = screen.getByRole('button', { name: 'Alle 12' })
    const on = screen.getByRole('button', { name: 'Aktiv 3' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(on).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'STRING' })).toBeInTheDocument()

    await user.click(on)
    expect(onFilterChange).toHaveBeenCalledWith('on')
  })
})
