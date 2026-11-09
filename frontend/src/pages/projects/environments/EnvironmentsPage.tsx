import {
  ArrowDown,
  ArrowUp,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import api from '@/lib/axios'
import { apiMessage, useCanManageProject } from '../settings/project'
import { EnvironmentDialog } from './EnvironmentDialog'
import {
  countFlagsPerEnvironment,
  type Environment,
  moveEnvironment,
  type ProjectFlag,
} from './environments'

export default function EnvironmentsPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const { canManage, roleLoading, organizationId } =
    useCanManageProject(projectId)
  const [environments, setEnvironments] = useState<Environment[]>([])
  /** Flag list for the counts; `null` = not (yet) available, the column shows "–". */
  const [flags, setFlags] = useState<ProjectFlag[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Targets outlive the open flags so the dialogs keep their content while closing.
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Environment | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Environment | null>(null)
  const reorderInFlight = useRef(false)

  const fetchEnvironments = useCallback(async (): Promise<Environment[]> => {
    const response = await api.get(`/environments/project/${projectId}`)
    return response.data.environments ?? []
  }, [projectId])

  const fetchFlags = useCallback(() => {
    // Counts are secondary: the page works without them.
    api
      .get(`/feature-flags/project/${projectId}`)
      .then((response) => setFlags(response.data.featureFlags ?? []))
      .catch(() => setFlags(null))
  }, [projectId])

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      setEnvironments(await fetchEnvironments())
      fetchFlags()
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [fetchEnvironments, fetchFlags])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const counts = flags ? countFlagsPerEnvironment(flags, environments) : null

  const reorder = async (envId: string, direction: 'up' | 'down') => {
    // One reorder at a time: each request carries the full id list, so a second
    // click must build on the first one's result. Buttons stay enabled
    // (disabling them would drop keyboard focus).
    if (reorderInFlight.current) return
    const previous = environments
    const next = moveEnvironment(previous, envId, direction)
    if (!next) return

    reorderInFlight.current = true
    setEnvironments(next) // optimistic
    try {
      const response = await api.post(
        `/environments/project/${projectId}/reorder`,
        {
          environmentIds: next.map((e) => e.id),
        }
      )
      const persisted: Environment[] | undefined = response.data?.environments
      if (persisted) setEnvironments(persisted)
    } catch (error) {
      toast.error(
        apiMessage(error, t('environments-page.toast.reorder-failed'))
      )
      // The optimistic order is unknown to the server (or stale, e.g. an
      // environment was added elsewhere): show what is actually persisted.
      try {
        setEnvironments(await fetchEnvironments())
      } catch {
        setEnvironments(previous)
      }
    } finally {
      reorderInFlight.current = false
    }
  }

  const save = async ({ name, key }: { name: string; key: string }) => {
    try {
      if (editing) {
        const response = await api.patch(`/environments/${editing.id}`, {
          name,
        })
        const updated: Environment = response.data.environment
        setEnvironments((list) =>
          list.map((e) => (e.id === editing.id ? { ...e, ...updated } : e))
        )
        toast.success(t('environments-page.toast.renamed'))
      } else {
        const response = await api.post('/environments', {
          name,
          key,
          projectId,
          organizationId,
        })
        setEnvironments((list) => [...list, response.data.environment])
        toast.success(t('environments-page.toast.created'))
      }
    } catch (error) {
      toast.error(
        apiMessage(
          error,
          editing
            ? t('environments-page.toast.rename-failed')
            : t('environments-page.toast.create-failed')
        )
      )
      throw error
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await api.delete(`/environments/${deleting.id}`)
      setEnvironments((list) => list.filter((e) => e.id !== deleting.id))
      toast.success(t('environments-page.toast.deleted'))
    } catch (error) {
      toast.error(apiMessage(error, t('environments-page.toast.delete-failed')))
    }
  }

  const loading = isLoading || roleLoading

  const columns: DataTableColumn<Environment>[] = [
    {
      key: 'name',
      header: t('environments-page.col-name'),
      cell: (env) => (
        <span
          data-testid="environment-row"
          data-environment-name={env.name}
          className="font-medium"
        >
          {env.name}
        </span>
      ),
    },
    {
      key: 'key',
      header: t('environments-page.col-key'),
      cell: (env) => (
        <code className="font-mono text-xs text-muted-foreground">
          {env.key}
        </code>
      ),
    },
    {
      key: 'flags',
      header: t('environments-page.col-flags'),
      hideBelow: 'sm',
      className: 'whitespace-nowrap tabular-nums',
      cell: (env) => {
        const count = counts?.[env.id]
        if (!count) return <span className="text-muted-foreground">–</span>
        return (
          <span title={t('environments-page.flags-title', { ...count })}>
            {t('environments-page.flags-count', { ...count })}
          </span>
        )
      },
    },
  ]
  if (canManage && !loading) {
    columns.push(
      {
        key: 'order',
        header: t('environments-page.col-order'),
        width: '6rem',
        cell: (env) => {
          const index = environments.findIndex((e) => e.id === env.id)
          return (
            <div className="inline-flex overflow-hidden rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none border-r"
                aria-label={t('environments-page.move-up', { name: env.name })}
                title={t('environments-page.move-up', { name: env.name })}
                disabled={index === 0}
                onClick={() => reorder(env.id, 'up')}
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-none"
                aria-label={t('environments-page.move-down', {
                  name: env.name,
                })}
                title={t('environments-page.move-down', { name: env.name })}
                disabled={index === environments.length - 1}
                onClick={() => reorder(env.id, 'down')}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )
        },
      },
      {
        key: 'actions',
        header: t('environments-page.col-actions'),
        srOnlyHeader: true,
        width: '3rem',
        align: 'right',
        className: 'px-2',
        cell: (env) => (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label={t('environments-page.actions', { name: env.name })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(env)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t('environments-page.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setDeleting(env)
                  setDeleteOpen(true)
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }
    )
  }

  const addButton = (
    <Button
      onClick={() => {
        setEditing(null)
        setDialogOpen(true)
      }}
      disabled={!organizationId}
    >
      <Plus className="mr-2 h-4 w-4" />
      {t('environments-page.add')}
    </Button>
  )

  let content: React.ReactNode
  if (loading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(e) => e.id}
        loading
        loadingRows={3}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('environments-page.load-error')} onRetry={load} />
    )
  } else if (environments.length === 0) {
    content = (
      <EmptyState
        icon={<Globe className="h-5 w-5" />}
        title={t('environments-page.empty-title')}
        description={t('environments-page.empty-text')}
        action={canManage ? addButton : undefined}
      />
    )
  } else {
    content = (
      <div className="space-y-2">
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            {t('environments-page.read-only')}
          </p>
        )}
        <DataTable
          columns={columns}
          rows={environments}
          getRowId={(e) => e.id}
          label={t('environments-page.title')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('environments-page.title')}
        description={t('environments-page.subtitle')}
        actions={
          canManage && !loading && !loadError && environments.length > 0
            ? addButton
            : undefined
        }
      />
      {content}

      <EnvironmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        environment={editing}
        onSubmit={save}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('environments-page.delete.title')}
        description={t('environments-page.delete.description', {
          name: deleting?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
      />
    </div>
  )
}
