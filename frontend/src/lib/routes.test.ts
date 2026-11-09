import { describe, expect, it } from 'vitest'
import { getArea, orgPath, projectPath } from './routes'

describe('routes', () => {
  it('builds project and org paths', () => {
    expect(projectPath('p1')).toBe('/projects/p1/flags')
    expect(projectPath('p1', 'experiments')).toBe('/projects/p1/experiments')
    expect(orgPath('o1')).toBe('/orgs/o1/projects')
    expect(orgPath('o1', 'audit-log')).toBe('/orgs/o1/audit-log')
  })

  it.each([
    ['/overview', { area: 'overview' }],
    ['/projects/p1/flags/f1', { area: 'project', id: 'p1', section: 'flags' }],
    ['/orgs/o1/members', { area: 'org', id: 'o1', section: 'members' }],
    ['/orgs/new', { area: 'org' }],
    ['/account', { area: 'account' }],
    ['/something', { area: 'overview' }],
  ])('detects area for %s', (path, expected) => {
    expect(getArea(path)).toEqual(expected)
  })
})
