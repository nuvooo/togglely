import { BadRequestException } from '@nestjs/common'
import { parseOrgAuditLogQuery } from './audit-log-query'

const PROJECT = '64a000000000000000000020'
const USER = '64a000000000000000000001'

describe('parseOrgAuditLogQuery', () => {
  it('returns an empty query without parameters', () => {
    expect(parseOrgAuditLogQuery({})).toEqual({})
  })

  it('parses every filter', () => {
    expect(
      parseOrgAuditLogQuery({
        limit: '50',
        before: '2026-11-09T10:00:00.000Z',
        projectId: PROJECT,
        userId: USER,
        action: 'flag.',
      })
    ).toEqual({
      limit: 50,
      before: new Date('2026-11-09T10:00:00.000Z'),
      projectId: PROJECT,
      userId: USER,
      action: 'flag.',
    })
  })

  it('parses a compound cursor <createdAt>_<id>', () => {
    expect(
      parseOrgAuditLogQuery({ before: '2026-11-09T10:00:00.000Z_' + USER })
    ).toEqual({
      before: new Date('2026-11-09T10:00:00.000Z'),
      beforeId: USER,
    })
  })

  it('accepts the limit bounds 1 and 200', () => {
    expect(parseOrgAuditLogQuery({ limit: '1' }).limit).toBe(1)
    expect(parseOrgAuditLogQuery({ limit: '200' }).limit).toBe(200)
  })

  it('ignores empty filter values', () => {
    expect(
      parseOrgAuditLogQuery({ projectId: '', userId: '', action: '' })
    ).toEqual({})
  })

  it.each([
    ['limit 0', { limit: '0' }],
    ['limit 201', { limit: '201' }],
    ['a fractional limit', { limit: '1.5' }],
    ['a non-numeric limit', { limit: 'ten' }],
    ['a malformed before', { before: 'yesterday' }],
    ['a cursor with a malformed id', { before: '2026-11-09T10:00:00.000Z_nope' }],
    ['a cursor without an id', { before: '2026-11-09T10:00:00.000Z_' }],
    ['an impossible before date', { before: '2026-13-45T99:00:00.000Z' }],
    ['a malformed projectId', { projectId: 'nope' }],
    ['a malformed userId', { userId: '123' }],
    ['an action with upper case', { action: 'Flag.created' }],
    ['an action with regex characters', { action: 'flag.*' }],
    ['an action with $', { action: '$where' }],
    ['an action longer than 64 characters', { action: 'a'.repeat(65) }],
    ['repeated parameters', { projectId: [PROJECT, PROJECT] }],
    ['an object parameter', { action: { $ne: '' } }],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseOrgAuditLogQuery(raw as any)).toThrow(BadRequestException)
  })
})
