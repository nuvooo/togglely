import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
  })

  it('renders breadcrumb, a single h1, description, meta and actions', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Dark mode"
          description="Schaltet das dunkle Theme"
          breadcrumb={[
            { label: 'Shop', to: '/projects/p1' },
            { label: 'Flags', to: '/projects/p1/flags' },
            { label: 'Dark mode' },
          ]}
          meta={<span>BOOLEAN</span>}
          actions={<button type="button">Löschen</button>}
        />
      </MemoryRouter>
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dark mode'
    )
    expect(screen.getByText('Schaltet das dunkle Theme')).toBeInTheDocument()
    expect(screen.getByText('BOOLEAN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Brotkrümelnavigation' })
    expect(within(nav).getByRole('link', { name: 'Shop' })).toHaveAttribute(
      'href',
      '/projects/p1'
    )
    expect(within(nav).getByRole('link', { name: 'Flags' })).toHaveAttribute(
      'href',
      '/projects/p1/flags'
    )
    expect(within(nav).getByText('Dark mode')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('omits the breadcrumb when none is given', () => {
    render(<PageHeader title="Webhooks" />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
