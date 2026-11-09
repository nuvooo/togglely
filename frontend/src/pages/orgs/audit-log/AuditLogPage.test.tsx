import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

const ORG_ID = 'org-1'
const P1 = '0123456789abcdef01234567'
const U1 = '0123456789abcdef0123aaaa'
const U2 = '0123456789abcdef0123bbbb'

const state = vi.hoisted(() => ({
  pages: [] as { auditLogs: unknown[]; nextCursor: string | null }[],
  fail: false,
}))
const api = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/axios', () => ({ default: api }))
vi.mock('@/lib/workspace', () => ({
  refreshWorkspace: vi.fn(() => Promise.resolve()),
  useWorkspace: () => ({
    projects: [],
    organizations: [{ id: 'org-1', name: 'Acme', role: 'VIEWER' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [
      {
        id: '0123456789abcdef01234567',
        name: 'Shop',
        key: 'shop',
        type: 'SINGLE',
        organizationId: 'org-1',
      },
    ],
  }),
}))

import AuditLogPage from './AuditLogPage'

const log = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  action: 'flag.created',
  entityType: 'FeatureFlag',
  entityId: `flag-${id}`,
  createdAt: '2026-11-09T10:00:00.000Z',
  user: { id: U1, email: 'ada@example.com', firstName: 'Ada', lastName: 'L' },
  project: { id: P1, name: 'Shop', key: 'shop' },
  newValues: { name: `Flag ${id}` },
  ...extra,
})

const auditCalls = () =>
  api.get.mock.calls.filter(
    ([url]) => url === `/audit-logs/organization/${ORG_ID}`
  )

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/orgs/${ORG_ID}/audit-log`]}>
      <Routes>
        <Route path="/orgs/:orgId/audit-log" element={<AuditLogPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('AuditLogPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    state.fail = false
    state.pages = [
      {
        auditLogs: [
          log('a'),
          log('b', {
            action: 'webhook.secret_rotated',
            entityType: 'webhook',
            user: null,
            project: null,
            newValues: undefined,
            oldValues: { url: 'https://hooks.example.com' },
          }),
          log('c', { action: 'something.unknown' }),
        ],
        nextCursor: '2026-11-09T09:00:00.000Z',
      },
      {
        auditLogs: [log('c'), log('d', { action: 'invite.accepted' })],
        nextCursor: null,
      },
    ]
    api.get.mockReset()
    api.get.mockImplementation(
      (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === `/audit-logs/organization/${ORG_ID}/users`) {
          return Promise.resolve({
            data: {
              users: [
                {
                  id: U1,
                  email: 'ada@example.com',
                  firstName: 'Ada',
                  lastName: 'L',
                  isMember: true,
                },
                {
                  id: U2,
                  email: 'zed@example.com',
                  firstName: 'Zed',
                  lastName: '',
                  isMember: false,
                },
              ],
            },
          })
        }
        if (url === `/audit-logs/organization/${ORG_ID}`) {
          if (state.fail) return Promise.reject(new Error('down'))
          const page = config?.params?.before ? state.pages[1] : state.pages[0]
          return Promise.resolve({ data: page })
        }
        return Promise.reject(new Error(`unexpected GET ${url}`))
      }
    )
  })

  it('shows translated actions, user, object and project', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Audit log' })
    const a = within(table).getByText('Flag a').closest('tr') as HTMLElement
    expect(within(a).getByText('Flag created')).toBeInTheDocument()
    expect(within(a).getByText('Ada L')).toBeInTheDocument()
    expect(within(a).getByRole('link', { name: 'Shop' })).toBeInTheDocument()
    const b = within(table)
      .getByText('https://hooks.example.com')
      .closest('tr') as HTMLElement
    expect(within(b).getByText('Webhook secret rotated')).toBeInTheDocument()
    expect(within(b).getByText('System')).toBeInTheDocument()
    // Unknown actions are shown raw
    expect(within(table).getByText('something.unknown')).toBeInTheDocument()
    expect(auditCalls()[0][1]).toEqual({ params: { limit: 50 } })
  })

  it('expands a row with the old and new values', async () => {
    const user = userEvent.setup()
    renderPage()
    const toggle = await screen.findByRole('button', {
      name: 'Show details of Flag created',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const details = document.getElementById(
      toggle.getAttribute('aria-controls')!
    )!
    expect(within(details).getByText('Old values')).toBeInTheDocument()
    expect(within(details).getByText(/"name": "Flag a"/)).toBeInTheDocument()
  })

  it('loads more entries with the cursor and skips duplicates', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Invite accepted')).toBeInTheDocument()
    expect(auditCalls()[1][1]).toEqual({
      params: { limit: 50, before: '2026-11-09T09:00:00.000Z' },
    })
    expect(screen.getAllByText('Flag c')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('reloads with the selected filters', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Project'), P1)
    await user.selectOptions(screen.getByLabelText('Action'), 'flag.')
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Ada L' })).toBeInTheDocument()
    )
    await user.selectOptions(screen.getByLabelText('User'), U1)
    await waitFor(() =>
      expect(auditCalls()[auditCalls().length - 1][1]).toEqual({
        params: { limit: 50, projectId: P1, action: 'flag.', userId: U1 },
      })
    )
  })

  it('offers former members found in the log as user filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    const option = await screen.findByRole('option', {
      name: 'Zed (former member)',
    })
    await user.selectOptions(screen.getByLabelText('User'), option)
    await waitFor(() =>
      expect(auditCalls()[auditCalls().length - 1][1]).toEqual({
        params: { limit: 50, userId: U2 },
      })
    )
  })

  it('shows an empty state for filters without results', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    state.pages[0] = { auditLogs: [], nextCursor: null }
    await user.selectOptions(screen.getByLabelText('Action'), 'invite.')
    expect(await screen.findByText('No matching entries')).toBeInTheDocument()
    await user.click(
      screen.getAllByRole('button', { name: 'Reset filters' })[0]
    )
    await waitFor(() => expect(screen.getByLabelText('Action')).toHaveValue(''))
  })

  it('shows a load error with retry', async () => {
    const user = userEvent.setup()
    state.fail = true
    renderPage()
    expect(
      await screen.findByText('The audit log could not be loaded.')
    ).toBeInTheDocument()
    state.fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('table', { name: 'Audit log' })
    ).toBeInTheDocument()
  })
})
