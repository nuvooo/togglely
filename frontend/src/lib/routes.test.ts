import { describe, expect, it } from 'vitest'
import { brandPath, experimentPath, flagPath, getArea, orgPath, projectPath, ROUTES, webhookPath } from './routes'

describe('routes', () => {
  it('builds project and org paths', () => {
    expect(projectPath('p1')).toBe('/projects/p1/flags')
    expect(projectPath('p1', 'experiments')).toBe('/projects/p1/experiments')
    expect(orgPath('o1')).toBe('/orgs/o1/projects')
    expect(orgPath('o1', 'audit-log')).toBe('/orgs/o1/audit-log')
  })

  it('builds detail paths', () => {
    expect(flagPath('p1', 'f1')).toBe('/projects/p1/flags/f1')
    expect(experimentPath('p1', 'e1')).toBe('/projects/p1/experiments/e1')
    expect(brandPath('p1', 'b1')).toBe('/projects/p1/brands/b1')
    expect(webhookPath('p1', 'w1')).toBe('/projects/p1/webhooks/w1')
  })

  it('exposes static routes', () => {
    expect(ROUTES).toEqual({
      overview: '/overview',
      orgs: '/orgs',
      newOrg: '/orgs/new',
      account: '/account',
      projects: '/projects',
    })
  })

  it.each([
    ['/overview', { area: 'overview' }],
    ['/projects', { area: 'project-picker' }],
    ['/projects/', { area: 'project-picker' }],
    ['/projects/p1/flags/f1', { area: 'project', id: 'p1', section: 'flags' }],
    ['/projects/p1', { area: 'project', id: 'p1', section: 'flags' }],
    ['/projects/p1/webhooks/w1', { area: 'project', id: 'p1', section: 'webhooks' }],
    ['/orgs/o1/members', { area: 'org', id: 'o1', section: 'members' }],
    ['/orgs/o1', { area: 'org', id: 'o1', section: 'projects' }],
    ['/orgs/new', { area: 'org' }],
    ['/account', { area: 'account' }],
    ['/something', { area: 'overview' }],
  ])('detects area for %s', (path, expected) => {
    expect(getArea(path)).toEqual(expected)
  })
})
