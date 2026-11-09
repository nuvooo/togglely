import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [
      { id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' },
      { id: 'p2', name: 'Shop', key: 'shop-2', type: 'SINGLE', organizationId: 'o1' },
    ],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
  resetWorkspaceCache: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { featureFlags: [] } })) },
}))

import { CommandPalette } from './CommandPalette'

function renderPalette(path = '/overview') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommandPalette />
    </MemoryRouter>
  )
}

const searchBox = () => screen.queryByPlaceholderText(/suchen|search/i)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CommandPalette', () => {
  it('opens with Ctrl+K and lists projects', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    renderPalette()
    expect(searchBox()).toBeNull()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(searchBox()).toBeInTheDocument()
    expect(screen.getAllByText('Shop')).toHaveLength(2)
  })

  it('uses Cmd+K on Mac and ignores Ctrl+K and key repeat', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    renderPalette()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(searchBox()).toBeNull()
    fireEvent.keyDown(document, { key: 'k', metaKey: true, repeat: true })
    expect(searchBox()).toBeNull()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(searchBox()).toBeInTheDocument()
  })

  it('offers navigation, a log out action and unique item values', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    renderPalette('/projects/p1/flags')
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    expect(screen.getByText(/log out|abmelden/i)).toBeInTheDocument()
    expect(screen.getByText(/Shop · (Experiments|Experimente)/)).toBeInTheDocument()

    const values = Array.from(document.querySelectorAll('[cmdk-item]')).map((el) =>
      el.getAttribute('data-value')
    )
    expect(values.length).toBeGreaterThan(5)
    expect(new Set(values).size).toBe(values.length)
  })
})
