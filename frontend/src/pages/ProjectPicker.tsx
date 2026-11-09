import { ChevronRight, FolderKanban } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { WorkspaceError } from '@/components/shell/WorkspaceError'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { projectPath, ROUTES } from '@/lib/routes'
import { useWorkspace, type WorkspaceProject } from '@/lib/workspace'

function ProjectGroup({ label, projects }: { label: string; projects: WorkspaceProject[] }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={projectPath(p.id)}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-[10px] font-semibold text-secondary-foreground">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{p.key}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `/projects`: choose a project when none is remembered. */
export default function ProjectPicker() {
  const { t } = useTranslation()
  const { projects, organizations, isLoading, error } = useWorkspace()

  const knownOrgIds = new Set(organizations.map((o) => o.id))
  const groups = organizations
    .map((org) => ({ id: org.id, label: org.name, projects: projects.filter((p) => p.organizationId === org.id) }))
    .filter((g) => g.projects.length > 0)
  const orphans = projects.filter((p) => !knownOrgIds.has(p.organizationId))
  if (orphans.length > 0) groups.push({ id: '__other', label: t('nav.other'), projects: orphans })

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-4/5" />
      </div>
    )
  } else if (error && projects.length === 0) {
    body = <WorkspaceError className="rounded-lg border" />
  } else if (projects.length === 0) {
    body = (
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
        <FolderKanban className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{t('project-picker.empty')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('project-picker.empty-hint')}</p>
        <Button asChild className="mt-5">
          <Link to={ROUTES.orgs}>{t('project-picker.go-to-orgs')}</Link>
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-6">
        {groups.map((g) => (
          <ProjectGroup key={g.id} label={g.label} projects={g.projects} />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('project-picker.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('project-picker.description')}</p>
      </div>
      {body}
    </div>
  )
}
