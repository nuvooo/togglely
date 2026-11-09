import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/axios', () => ({ default: { get: mocks.get } }))

import OverviewPage from './OverviewPage'

function Where() {
  const { pathname } = useLocation()
  return <div data-testid="where">{pathname}</div>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString()

const overview = {
  counts: {
    organizations: 2,
    projects: 2,
    flags: 7,
    flagsEnabledInProduction: 3,
    runningExperiments: 1,
  },
  recentFlags: [
    {
      id: 'f1',
      projectId: 'p1',
      key: 'dark-mode',
      name: 'Dark mode',
      flagType: 'BOOLEAN',
      updatedAt: recent,
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Shop',
      key: 'shop',
      type: 'SINGLE',
      organizationId: 'o1',
      organizationName: 'Acme',
      flagCount: 5,
      environmentCount: 2,
      updatedAt: recent,
    },
    {
      id: 'p2',
      name: 'App',
      key: 'app',
      type: 'MULTI',
      organizationId: 'o2',
      organizationName: 'Globex',
      flagCount: 2,
      environmentCount: 3,
      updatedAt: recent,
    },
  ],
}

describe('OverviewPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    mocks.get.mockReset()
    mocks.get.mockResolvedValue({ data: overview })
  })

  it('shows the key figures from GET /overview', async () => {
    renderPage()
    const figure = async (label: RegExp) =>
      (await screen.findByText(label)).closest('div')?.parentElement
    expect(await figure(/^organizations$/i)).toHaveTextContent('2')
    expect(await figure(/^feature flags$/i)).toHaveTextContent('7')
    expect(await figure(/enabled in production/i)).toHaveTextContent('3')
    expect(await figure(/running experiments/i)).toHaveTextContent('1')
    expect(mocks.get).toHaveBeenCalledWith('/overview')
  })

  it('links recently changed flags to their flag page', async () => {
    renderPage()
    const list = (
      await screen.findByRole('heading', { name: /recently changed/i })
    ).parentElement as HTMLElement
    expect(
      within(list).getByRole('link', { name: /dark mode/i })
    ).toHaveAttribute('href', '/projects/p1/flags/f1')
    expect(within(list).getByText(/shop · dark-mode/i)).toBeInTheDocument()
  })

  it('lists the projects with organization and counts and opens one on row click', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /projects/i })
    expect(within(table).getByRole('link', { name: /shop/i })).toHaveAttribute(
      'href',
      '/projects/p1/flags'
    )
    expect(within(table).getByText('Globex')).toBeInTheDocument()
    expect(within(table).getByText('Multi-brand')).toBeInTheDocument()
    fireEvent.click(within(table).getByText('Globex'))
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/projects/p2/flags'
    )
  })

  it('shows a dash when no project has a production environment', async () => {
    mocks.get.mockResolvedValue({
      data: {
        ...overview,
        counts: { ...overview.counts, flagsEnabledInProduction: null },
      },
    })
    renderPage()
    expect(
      await screen.findByText(/no production environment/i)
    ).toBeInTheDocument()
  })

  it('invites users without organizations to create one', async () => {
    mocks.get.mockResolvedValue({
      data: {
        counts: {
          organizations: 0,
          projects: 0,
          flags: 0,
          flagsEnabledInProduction: null,
          runningExperiments: 0,
        },
        recentFlags: [],
        projects: [],
      },
    })
    renderPage()
    expect(await screen.findByText(/no organization yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /create organization/i })
    ).toHaveAttribute('href', '/orgs/new')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a loading state and an error with retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not be loaded/i
    )
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(
      await screen.findByRole('table', { name: /projects/i })
    ).toBeInTheDocument()
  })
})
