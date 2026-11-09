import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { IntegrationCard } from './IntegrationCard'

describe('IntegrationCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de')
  })

  it('shows stream URL, EventSource and ETag examples and links to webhooks', () => {
    render(
      <MemoryRouter>
        <IntegrationCard
          projectId="p1"
          projectKey="shop"
          environments={[{ id: 'e1', name: 'Production', key: 'production' }]}
        />
      </MemoryRouter>
    )
    const origin = window.location.origin
    expect(screen.getByLabelText('Live-Stream-URL')).toHaveValue(`${origin}/sdk/stream/shop/production`)
    expect(screen.getByLabelText('Live-Stream (Server-Sent Events)')).toHaveTextContent('new EventSource(')
    expect(screen.getByLabelText('Live-Stream (Server-Sent Events)')).toHaveTextContent("'flags-changed'")
    const etag = screen.getByLabelText('Polling mit ETag')
    expect(etag).toHaveTextContent('If-None-Match')
    expect(etag).toHaveTextContent(`${origin}/sdk/flags/shop/production`)
    expect(screen.getByRole('link', { name: /Webhooks verwalten/ })).toHaveAttribute('href', '/projects/p1/webhooks')
  })
})
