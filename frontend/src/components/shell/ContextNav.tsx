import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { getArea, orgPath, projectPath, ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

interface NavItem {
  key: string
  label: string
  href: string
}

function NavList({
  items,
  activeKey,
  onNavigate,
}: {
  items: NavItem[]
  activeKey: string
  onNavigate?: () => void
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            to={item.href}
            onClick={onNavigate}
            aria-current={item.key === activeKey ? 'page' : undefined}
            className={cn(
              'block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
              item.key === activeKey && 'bg-sidebar-accent font-medium text-foreground'
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 mt-5 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/**
 * Second navigation column; content depends on the active area.
 * `onNavigate` fires on every link click (also for the current page), e.g. to close the mobile drawer.
 */
export function ContextNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t } = useTranslation()
  const { pathname, hash } = useLocation()
  const area = getArea(pathname)
  const { projects } = useWorkspace()
  const rememberProject = useWorkspaceStore((s) => s.rememberProject)
  const rememberOrg = useWorkspaceStore((s) => s.rememberOrg)

  const project = area.area === 'project' ? projects.find((p) => p.id === area.id) : undefined
  const projectId = project?.id
  const projectOrgId = project?.organizationId
  const orgId = area.area === 'org' ? area.id : undefined

  // Depend on primitive ids, not object identity, so re-fetched data cannot loop.
  useEffect(() => {
    if (projectId && projectOrgId) rememberProject(projectId, projectOrgId)
  }, [projectId, projectOrgId, rememberProject])

  useEffect(() => {
    if (orgId) rememberOrg(orgId)
  }, [orgId, rememberOrg])

  if (area.area === 'overview' || area.area === 'project-picker') return null

  let content: ReactNode = null

  if (area.area === 'project') {
    const main: NavItem[] = [
      { key: 'flags', label: t('nav.feature-flags'), href: projectPath(area.id, 'flags') },
      { key: 'experiments', label: t('nav.experiments'), href: projectPath(area.id, 'experiments') },
      { key: 'environments', label: t('nav.environments'), href: projectPath(area.id, 'environments') },
    ]
    if (project?.type === 'MULTI') {
      main.push({ key: 'brands', label: t('nav.brands'), href: projectPath(area.id, 'brands') })
    }
    const develop: NavItem[] = [
      { key: 'sdk', label: t('nav.sdk'), href: projectPath(area.id, 'sdk') },
      { key: 'settings', label: t('nav.settings'), href: projectPath(area.id, 'settings') },
    ]
    content = (
      <>
        <WorkspaceSwitcher kind="project" currentId={area.id} />
        <div className="mt-4" />
        <NavList items={main} activeKey={area.section} onNavigate={onNavigate} />
        <SectionLabel>{t('nav.develop')}</SectionLabel>
        <NavList items={develop} activeKey={area.section} onNavigate={onNavigate} />
      </>
    )
  } else if (area.area === 'org') {
    const items: NavItem[] = area.id
      ? [
          { key: 'projects', label: t('nav.projects'), href: orgPath(area.id, 'projects') },
          { key: 'members', label: t('nav.members'), href: orgPath(area.id, 'members') },
          { key: 'api-keys', label: t('nav.api-keys'), href: orgPath(area.id, 'api-keys') },
          { key: 'audit-log', label: t('nav.audit-log'), href: orgPath(area.id, 'audit-log') },
          { key: 'settings', label: t('nav.settings'), href: orgPath(area.id, 'settings') },
        ]
      : []
    content = (
      <>
        <WorkspaceSwitcher kind="org" currentId={area.id} />
        <div className="mt-4" />
        <NavList items={items} activeKey={area.section ?? ''} onNavigate={onNavigate} />
      </>
    )
  } else {
    const items: NavItem[] = [
      { key: '', label: t('nav.profile'), href: ROUTES.account },
      { key: '#security', label: t('nav.profile-security'), href: `${ROUTES.account}#security` },
      { key: '#appearance', label: t('nav.appearance'), href: `${ROUTES.account}#appearance` },
    ]
    content = (
      <>
        <div className="px-2.5 pb-3 text-sm font-semibold">{t('nav.account')}</div>
        <NavList items={items} activeKey={hash === '#profile' ? '' : hash} onNavigate={onNavigate} />
      </>
    )
  }

  return (
    <aside className="h-full w-60 overflow-y-auto border-r bg-sidebar p-3">
      <nav aria-label={t('nav.context')}>{content}</nav>
    </aside>
  )
}
