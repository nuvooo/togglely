import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Rail } from './Rail'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Rail />
      </TooltipProvider>
    </MemoryRouter>
  )

describe('Rail', () => {
  beforeEach(() => useWorkspaceStore.setState({ lastProjectId: 'p1', lastOrgId: 'o1' }))

  it('links project and org to the remembered context', () => {
    renderAt('/overview')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('href', '/projects/p1/flags')
    expect(screen.getByRole('link', { name: /organisation|organization/i })).toHaveAttribute('href', '/orgs/o1/projects')
  })

  it('marks the active area', () => {
    renderAt('/projects/p1/experiments')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /übersicht|overview/i })).not.toHaveAttribute('aria-current')
  })

  it('highlights the project area on the project picker', () => {
    renderAt('/projects')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('aria-current', 'page')
  })

  it('falls back to selection pages without context', () => {
    useWorkspaceStore.setState({ lastProjectId: null, lastOrgId: null })
    renderAt('/overview')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: /organisation|organization/i })).toHaveAttribute('href', '/orgs')
  })
})
