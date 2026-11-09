import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./environments/EnvironmentsPage', () => ({
  default: () => <p>environments page</p>,
}))
vi.mock('./brands/BrandsPage', () => ({ default: () => <p>brands page</p> }))
vi.mock('./settings/ProjectSettingsPage', () => ({
  default: () => <p>settings page</p>,
}))

import ProjectSettings from './ProjectSettings'

const renderAt = (section: string) =>
  render(
    <MemoryRouter initialEntries={[`/projects/p1/${section}`]}>
      <Routes>
        <Route
          path="/projects/:projectId/environments"
          element={<ProjectSettings />}
        />
        <Route
          path="/projects/:projectId/brands"
          element={<ProjectSettings />}
        />
        <Route
          path="/projects/:projectId/settings"
          element={<ProjectSettings />}
        />
      </Routes>
    </MemoryRouter>
  )

describe('ProjectSettings (route dispatcher)', () => {
  it.each([
    ['environments', 'environments page'],
    ['brands', 'brands page'],
    ['settings', 'settings page'],
  ])('renders the %s page for its route', (section, text) => {
    renderAt(section)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
