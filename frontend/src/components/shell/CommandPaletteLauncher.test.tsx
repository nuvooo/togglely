import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [],
    organizations: [],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
  resetWorkspaceCache: vi.fn(),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { featureFlags: [] } })) },
}))

import { openCommandPalette } from './commandPaletteEvents'
import { CommandPaletteLauncher } from './CommandPaletteLauncher'

const renderLauncher = () =>
  render(
    <MemoryRouter>
      <CommandPaletteLauncher />
    </MemoryRouter>
  )
const searchBox = () => screen.queryByPlaceholderText(/suchen|search/i)

afterEach(() => vi.restoreAllMocks())

describe('CommandPaletteLauncher', () => {
  it('loads and opens the palette on the first shortcut, then toggles it', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    renderLauncher()
    expect(searchBox()).toBeNull()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(await screen.findByPlaceholderText(/suchen|search/i)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(searchBox()).toBeNull()
  })

  it('loads and opens the palette via openCommandPalette', async () => {
    renderLauncher()
    act(() => openCommandPalette())
    expect(await screen.findByPlaceholderText(/suchen|search/i)).toBeInTheDocument()
  })
})
