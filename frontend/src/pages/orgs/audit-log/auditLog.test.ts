import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { de } from '@/i18n/locales/de'
import { en } from '@/i18n/locales/en'
import {
  ACTION_FILTERS,
  appendPage,
  auditUserOptions,
  buildAuditParams,
  describeEntity,
  formatAction,
  formatActionFilter,
  formatAuditUser,
  formatValues,
  KNOWN_ACTIONS,
  type OrgAuditLogEntry,
} from './auditLog'

const entry = (id: string, extra: Partial<OrgAuditLogEntry> = {}) =>
  ({
    id,
    action: 'flag.created',
    entityType: 'FeatureFlag',
    entityId: `e-${id}`,
    createdAt: '2026-11-09T10:00:00.000Z',
    ...extra,
  }) as OrgAuditLogEntry

describe('audit log helpers', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('translates known actions and keeps unknown ones raw', () => {
    const t = i18n.t.bind(i18n)
    expect(formatAction('flag.created', t)).toBe('Flag created')
    expect(formatAction('user.password_reset_link_created', t)).toBe(
      'Password reset link created'
    )
    expect(formatAction('something.new', t)).toBe('something.new')
    expect(formatAction('toggled', t)).toBe('toggled')
  })

  it('has a label for every known action and filter group in both languages', () => {
    const keys = [
      ...KNOWN_ACTIONS.map(
        (a) => `org-pages.audit.action.${a.replace(/\./g, '-')}`
      ),
      ...ACTION_FILTERS.map(
        (p) => `org-pages.audit.group.${p.replace(/[._]+$/, '')}`
      ),
    ]
    for (const key of keys) {
      expect(en).toHaveProperty([key])
      expect(de).toHaveProperty([key])
    }
  })

  it('uses the same org-pages keys in German and English', () => {
    const own = (locale: Record<string, string>) =>
      Object.keys(locale)
        .filter((k) => k.startsWith('org-pages.'))
        .sort()
    expect(own(de)).toEqual(own(en))
  })

  it('labels action filter groups', () => {
    const t = i18n.t.bind(i18n)
    expect(formatActionFilter('flag.', t)).toBe('Flags')
    expect(formatActionFilter('targeting_rule.', t)).toBe('Targeting rules')
  })

  it('builds query parameters without empty filters', () => {
    expect(buildAuditParams({ projectId: '', userId: '', action: '' })).toEqual(
      { limit: 50 }
    )
    expect(
      buildAuditParams(
        { projectId: 'p1', userId: 'u1', action: 'flag.' },
        '2026-11-09T10:00:00.000Z'
      )
    ).toEqual({
      limit: 50,
      before: '2026-11-09T10:00:00.000Z',
      projectId: 'p1',
      userId: 'u1',
      action: 'flag.',
    })
  })

  it('appends pages without duplicates', () => {
    expect(
      appendPage([entry('a'), entry('b')], [entry('b'), entry('c')]).map(
        (l) => l.id
      )
    ).toEqual(['a', 'b', 'c'])
  })

  it('describes the changed object by its logged name or key', () => {
    expect(
      describeEntity(entry('a', { newValues: { name: 'Dark mode' } }))
    ).toBe('Dark mode')
    expect(describeEntity(entry('a', { oldValues: { flagKey: 'dark' } }))).toBe(
      'dark'
    )
    expect(describeEntity(entry('a', { newValues: { enabled: true } }))).toBe(
      'e-a'
    )
  })

  it('formats values as JSON and skips empty ones', () => {
    expect(formatValues(undefined)).toBeNull()
    expect(formatValues(null)).toBeNull()
    expect(formatValues({})).toBeNull()
    expect(formatValues({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(formatValues('text')).toBe('"text"')
  })

  it('names the acting user', () => {
    expect(formatAuditUser(null)).toBeNull()
    expect(
      formatAuditUser({
        id: 'u',
        email: 'a@x.io',
        firstName: 'Ada',
        lastName: 'L',
      })
    ).toBe('Ada L')
    expect(formatAuditUser({ id: 'u', email: 'a@x.io' })).toBe('a@x.io')
  })
})

describe('auditUserOptions', () => {
  const ada = { id: 'u1', email: 'ada@x.io', firstName: 'Ada', lastName: 'L' }
  const bob = { id: 'u2', email: 'bob@x.io', firstName: '', lastName: '' }

  it('lists log users, marks former members and adds users seen in entries', () => {
    const options = auditUserOptions(
      [
        { ...bob, isMember: false },
        { ...ada, isMember: true },
      ],
      [
        entry('a', { user: ada }),
        entry('b', {
          user: { id: 'u3', email: 'cy@x.io', firstName: 'Cy', lastName: null },
        }),
        entry('c', { user: null }),
      ]
    )
    expect(options).toEqual([
      { id: 'u1', label: 'Ada L', former: false },
      { id: 'u2', label: 'bob@x.io', former: true },
      { id: 'u3', label: 'Cy', former: false },
    ])
  })
})
