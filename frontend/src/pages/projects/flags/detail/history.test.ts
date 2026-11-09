import { describe, expect, it } from 'vitest'
import {
  type AuditLogEntry,
  filterFlagLogs,
  formatUser,
  summarizeChanges,
} from './history'

const log = (overrides: Partial<AuditLogEntry>): AuditLogEntry => ({
  id: 'l',
  action: 'flag.created',
  entityType: 'FeatureFlag',
  entityId: 'other',
  createdAt: '2026-11-09T09:00:00.000Z',
  ...overrides,
})

describe('filterFlagLogs', () => {
  it('keeps entries of the flag itself and entries naming it as flagId', () => {
    const logs = [
      log({ id: 'a', entityId: 'f1' }),
      log({ id: 'b', entityId: 'f2' }),
      log({
        id: 'c',
        entityType: 'TargetingRule',
        entityId: 'r1',
        newValues: { flagId: 'f1' },
      }),
      log({
        id: 'd',
        entityType: 'TargetingRule',
        entityId: 'r2',
        oldValues: { flagId: 'f1' },
      }),
      log({
        id: 'e',
        entityType: 'TargetingRule',
        entityId: 'r3',
        newValues: ['f1'],
      }),
    ]
    expect(filterFlagLogs(logs, 'f1').map((l) => l.id)).toEqual(['a', 'c', 'd'])
  })
})

describe('summarizeChanges', () => {
  it('shows old → new for changed fields and single values otherwise', () => {
    expect(
      summarizeChanges({
        oldValues: { enabled: false, name: 'Old' },
        newValues: {
          enabled: true,
          environmentId: 'e1',
          flagId: 'f1',
          flagKey: 'checkout',
        },
      })
    ).toBe('enabled: false → true, environmentId: e1, name: Old')
  })

  it('serializes objects and handles missing values', () => {
    expect(
      summarizeChanges({ newValues: { config: { a: 1 }, note: null } })
    ).toBe('config: {"a":1}, note: null')
    expect(summarizeChanges({})).toBe('')
  })
})

describe('formatUser', () => {
  it('prefers the full name and falls back to the email', () => {
    expect(
      formatUser({
        id: 'u',
        email: 'a@b.c',
        firstName: 'Ada',
        lastName: 'Lovelace',
      })
    ).toBe('Ada Lovelace')
    expect(
      formatUser({ id: 'u', email: 'a@b.c', firstName: null, lastName: null })
    ).toBe('a@b.c')
    expect(formatUser(null)).toBeNull()
  })
})
