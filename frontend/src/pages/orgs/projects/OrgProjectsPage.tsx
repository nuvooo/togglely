import { FolderKanban, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { PageToolbar } from '@/components/page/PageToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { handleForbidden } from '@/lib/permissions'
import { projectPath } from '@/lib/routes'
import { refreshWorkspace } from '@/lib/workspace'
import { formatRelative } from '@/pages/projects/flags/flagsFilter'
import { DeleteProjectDialog } from '@/pages/projects/settings/DeleteProjectDialog'
import { apiMessage } from '@/pages/projects/settings/project'
import { useOrgRole } from '../orgRole'
import { CreateProjectDialog, type NewProject } from './CreateProjectDialog'

/** `GET /projects/organization/:orgId` */
export interface OrgProject {
  id: string
  name: string
  key: string
  type: 'SINGLE' | 'MULTI'
  environmentCount?: number
  flagCount?: number
  createdAt?: string
  updatedAt?: string
}

export default function OrgProjectsPage() {
  const { t, i18n } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { organization, canManage, roleLoading, roleUnavailable } =
    useOrgRole(orgId)
  const [projects, setProjects] = useState<OrgProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<OrgProject | null>(null)
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const response = await api.get(`/projects/organization/${orgId}`)
      if (id === loadId.current) setProjects(response.data.projects ?? [])
    } catch {
      if (id === loadId.current) setLoadError(true)
    } finally {
      if (id === loadId.current) setIsLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (orgId) load()
  }, [orgId, load])

  // `?action=create-project` (overview quick action) opens the dialog once
  // the role is known; the parameter is dropped so a reload does not reopen it.
  useEffect(() => {
    if (searchParams.get('action') !== 'create-project' || roleLoading) return
    if (canManage) setCreateOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('action')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, roleLoading, canManage])

  const create = async (project: NewProject) => {
    try {
      const response = await api.post(
        `/projects/organization/${orgId}`,
        project
      )
      const created = response.data.project
      toast.success(t('org-pages.projects.created', { name: project.name }))
      // Keep the workspace switcher in sync.
      refreshWorkspace().catch(() => {})
      if (created?.id) navigate(projectPath(created.id))
      else load()
    } catch (error) {
      handleForbidden(error, t)
      throw new Error(apiMessage(error, t('org-pages.projects.create-failed')))
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
    )
  }, [projects, query])

  const columns: DataTableColumn<OrgProject>[] = [
    {
      key: 'name',
      header: t('org-pages.projects.col-name'),
      cell: (project) => (
        <div className="min-w-0">
          <Link
            to={projectPath(project.id)}
            className="block truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {project.name}
          </Link>
          <code className="block truncate font-mono text-xs text-muted-foreground">
            {project.key}
          </code>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('org-pages.projects.col-type'),
      width: '9rem',
      cell: (project) => (
        <Badge variant="neutral">
          {project.type === 'MULTI'
            ? t('org-pages.projects.type-multi-short')
            : t('org-pages.projects.type-single-short')}
        </Badge>
      ),
    },
    {
      key: 'environments',
      header: t('org-pages.projects.col-environments'),
      width: '8rem',
      hideBelow: 'md',
      className: 'tabular-nums',
      cell: (project) => project.environmentCount ?? '–',
    },
    {
      key: 'flags',
      header: t('org-pages.projects.col-flags'),
      width: '6rem',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (project) => project.flagCount ?? '–',
    },
    {
      key: 'updated',
      header: t('org-pages.projects.col-updated'),
      width: '9rem',
      hideBelow: 'lg',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (project) => {
        const date = project.updatedAt ?? project.createdAt
        const relative = formatRelative(date, i18n.language)
        return relative && date ? (
          <time
            dateTime={date}
            title={new Date(date).toLocaleString(i18n.language)}
          >
            {relative}
          </time>
        ) : (
          '–'
        )
      },
    },
  ]

  if (canManage) {
    columns.push({
      key: 'actions',
      header: t('org-pages.projects.col-actions'),
      srOnlyHeader: true,
      width: '3.5rem',
      align: 'right',
      className: 'px-2',
      cell: (project) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => setDeleting(project)}
          aria-label={t('org-pages.projects.delete-label', {
            name: project.name,
          })}
          title={t('project-settings.danger.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    })
  }

  const createButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('org-pages.projects.create')}
    </Button>
  )

  const loading = isLoading || roleLoading
  let content: React.ReactNode
  if (loading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(p) => p.id}
        loading
        loadingRows={4}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('org-pages.projects.load-error')} onRetry={load} />
    )
  } else if (projects.length === 0) {
    content = (
      <EmptyState
        icon={<FolderKanban className="h-5 w-5" />}
        title={t('org-pages.projects.empty-title')}
        description={
          canManage
            ? t('org-pages.projects.empty-text')
            : t('org-pages.projects.empty-text-readonly')
        }
        action={canManage ? createButton : undefined}
      />
    )
  } else {
    content = (
      <div className="space-y-3">
        <PageToolbar
          onSearch={setQuery}
          searchPlaceholder={t('org-pages.projects.search')}
        />
        <DataTable
          columns={columns}
          rows={visible}
          getRowId={(p) => p.id}
          label={t('org-pages.projects.title')}
          onRowClick={(p) => navigate(projectPath(p.id))}
          rowFocusable={false}
          empty={
            <EmptyState
              bordered={false}
              title={t('org-pages.projects.no-results')}
            />
          }
        />
      </div>
    )
  }

  const orgName = organization?.name ?? ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={orgName || t('org-pages.projects.title')}
        description={t('org-pages.projects.subtitle')}
        actions={
          canManage && !loading && !loadError && projects.length > 0
            ? createButton
            : undefined
        }
      />
      <RoleUnavailableNotice show={roleUnavailable} />
      {content}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgName={orgName}
        onCreate={create}
      />
      <DeleteProjectDialog
        project={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(project) => {
          setDeleting(null)
          setProjects((current) => current.filter((p) => p.id !== project.id))
        }}
      />
    </div>
  )
}
