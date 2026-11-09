import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { featureFlags: [] } })) },
}))

import { CommandPalette } from './CommandPalette'

describe('CommandPalette', () => {
  it('opens with Ctrl+K and lists projects', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )
    expect(screen.queryByPlaceholderText(/suchen|search/i)).toBeNull()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(/suchen|search/i)).toBeInTheDocument()
    expect(screen.getByText('Shop')).toBeInTheDocument()
  })
})
