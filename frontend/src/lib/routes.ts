const PROJECT_SECTIONS = ['flags', 'experiments', 'environments', 'brands', 'sdk', 'settings'] as const
const ORG_SECTIONS = ['projects', 'members', 'api-keys', 'audit-log', 'settings'] as const

export type ProjectSection = (typeof PROJECT_SECTIONS)[number]
export type OrgSection = (typeof ORG_SECTIONS)[number]

export type Area =
  | { area: 'overview' }
  | { area: 'account' }
  /** `/projects` without an id: the project picker. */
  | { area: 'project-picker' }
  | { area: 'project'; id: string; section: ProjectSection }
  | { area: 'org'; id?: string; section?: OrgSection }

/** Static top-level routes. */
export const ROUTES = {
  overview: '/overview',
  orgs: '/orgs',
  newOrg: '/orgs/new',
  account: '/account',
  projects: '/projects',
} as const

export const projectPath = (projectId: string, section: ProjectSection = 'flags') =>
  `/projects/${projectId}/${section}`

export const orgPath = (orgId: string, section: OrgSection = 'projects') =>
  `/orgs/${orgId}/${section}`

export const flagPath = (projectId: string, flagId: string) => `${projectPath(projectId, 'flags')}/${flagId}`

export const experimentPath = (projectId: string, experimentId: string) =>
  `${projectPath(projectId, 'experiments')}/${experimentId}`

export const brandPath = (projectId: string, brandId: string) => `${projectPath(projectId, 'brands')}/${brandId}`

const isProjectSection = (s: string | undefined): s is ProjectSection =>
  (PROJECT_SECTIONS as readonly string[]).includes(s ?? '')
const isOrgSection = (s: string | undefined): s is OrgSection => (ORG_SECTIONS as readonly string[]).includes(s ?? '')

/** Derives the active navigation area from a pathname. */
export function getArea(pathname: string): Area {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects') {
    if (!parts[1]) return { area: 'project-picker' }
    return { area: 'project', id: parts[1], section: isProjectSection(parts[2]) ? parts[2] : 'flags' }
  }
  if (parts[0] === 'orgs') {
    if (!parts[1] || parts[1] === 'new') return { area: 'org' }
    return { area: 'org', id: parts[1], section: isOrgSection(parts[2]) ? parts[2] : 'projects' }
  }
  if (parts[0] === 'account') return { area: 'account' }
  return { area: 'overview' }
}
