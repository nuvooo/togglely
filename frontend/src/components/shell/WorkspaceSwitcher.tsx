import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { orgPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspace, type WorkspaceProject } from '@/lib/workspace'

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-[10px] font-semibold text-secondary-foreground">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function Hint({ children }: { children: string }) {
  return <div className="px-2 py-1.5 text-xs text-muted-foreground">{children}</div>
}

const rowClass = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent'

/** Popover to switch the current project (grouped by org) or organization. */
export function WorkspaceSwitcher({ kind, currentId }: { kind: 'project' | 'org'; currentId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { projects, organizations, isLoading } = useWorkspace()

  const currentProject = kind === 'project' ? projects.find((p) => p.id === currentId) : undefined
  const current = kind === 'project' ? currentProject : organizations.find((o) => o.id === currentId)
  const subtitle = currentProject
    ? organizations.find((o) => o.id === currentProject.organizationId)?.name
    : undefined

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  // Projects whose organization is not in the list still need a home.
  const knownOrgIds = new Set(organizations.map((o) => o.id))
  const projectGroups: { id: string; label: string; projects: WorkspaceProject[] }[] = [
    ...organizations.map((org) => ({
      id: org.id,
      label: org.name,
      projects: projects.filter((p) => p.organizationId === org.id),
    })),
  ]
  const orphans = projects.filter((p) => !knownOrgIds.has(p.organizationId))
  if (orphans.length > 0) projectGroups.push({ id: '__other', label: t('nav.other'), projects: orphans })

  const projectRow = (p: WorkspaceProject) => (
    <button key={p.id} type="button" onClick={() => go(projectPath(p.id))} className={rowClass}>
      <Avatar name={p.name} />
      <span className="flex-1 truncate text-left">{p.name}</span>
      <Check className={cn('h-4 w-4', p.id === currentId ? 'opacity-100' : 'opacity-0')} />
    </button>
  )

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <div className="space-y-2 p-2" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-6 w-3/5" />
      </div>
    )
  } else if (kind === 'project') {
    body =
      projectGroups.length === 0 ? (
        <Hint>{t('nav.no-projects')}</Hint>
      ) : (
        projectGroups.map((group) => (
          <div key={group.id} className="py-1">
            <GroupLabel>{group.label}</GroupLabel>
            {group.projects.length === 0 && <Hint>{t('nav.no-projects')}</Hint>}
            {group.projects.map(projectRow)}
          </div>
        ))
      )
  } else {
    body = (
      <>
        {organizations.length === 0 && <Hint>{t('nav.no-orgs')}</Hint>}
        {organizations.map((o) => (
          <button key={o.id} type="button" onClick={() => go(orgPath(o.id))} className={rowClass}>
            <Avatar name={o.name} />
            <span className="flex-1 truncate text-left">{o.name}</span>
            <Check className={cn('h-4 w-4', o.id === currentId ? 'opacity-100' : 'opacity-0')} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => go('/orgs/new')}
          className="mt-1 flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> {t('nav.new-org')}
        </button>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent"
        >
          {isLoading && !current ? (
            <Skeleton className="h-6 w-6" />
          ) : (
            <Avatar name={current?.name ?? '?'} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {current?.name ??
                (isLoading
                  ? t('common.loading')
                  : t(kind === 'project' ? 'nav.select-project' : 'nav.select-org'))}
            </span>
            {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 overflow-y-auto">{body}</PopoverContent>
    </Popover>
  )
}
