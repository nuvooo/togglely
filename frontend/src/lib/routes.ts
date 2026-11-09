export type ProjectSection =
  | 'flags'
  | 'experiments'
  | 'environments'
  | 'brands'
  | 'sdk'
  | 'settings'
export type OrgSection =
  | 'projects'
  | 'members'
  | 'api-keys'
  | 'audit-log'
  | 'settings'

export type Area =
  | { area: 'overview' }
  | { area: 'account' }
  | { area: 'project'; id: string; section: string }
  | { area: 'org'; id?: string; section?: string }

export const projectPath = (projectId: string, section: ProjectSection = 'flags') =>
  `/projects/${projectId}/${section}`

export const orgPath = (orgId: string, section: OrgSection = 'projects') =>
  `/orgs/${orgId}/${section}`

/** Derives the active navigation area from a pathname. */
export function getArea(pathname: string): Area {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects' && parts[1]) {
    return { area: 'project', id: parts[1], section: parts[2] ?? 'flags' }
  }
  if (parts[0] === 'orgs') {
    if (!parts[1] || parts[1] === 'new') return { area: 'org' }
    return { area: 'org', id: parts[1], section: parts[2] ?? 'projects' }
  }
  if (parts[0] === 'account') return { area: 'account' }
  return { area: 'overview' }
}
