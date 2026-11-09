import { Copy, Globe, KeyRound, Plus, Server, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import api from '@/lib/axios'
import { handleForbidden } from '@/lib/permissions'
import { apiMessage } from '@/pages/projects/settings/project'
import { useAuthStore } from '@/store/authStore'
import { useOrgRole } from '../orgRole'
import { ApiKeyCreatedDialog } from './ApiKeyCreatedDialog'
import {
  type ApiKey,
  type ApiKeyType,
  CREATE_KEY_TYPES,
  displayKey,
  expiryState,
  mcpAddCommand,
} from './apiKeys'
import {
  CreateApiKeyDialog,
  type NewApiKey,
  type ProjectEnvironment,
} from './CreateApiKeyDialog'

const MCP_ONLY = ['MCP'] as const

interface OrgProjectEnvironments {
  id: string
  name: string
  environments?: { id: string; name: string }[]
}

/** CLIENT vs. SERVER, always visible above the list. */
function KeyTypesInfo() {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          ['CLIENT', Globe],
          ['SERVER', Server],
        ] as const
      ).map(([type, Icon]) => (
        <div key={type} className="flex gap-3 rounded-lg border bg-card p-3">
          <Icon
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">
              {t(`org-pages.api-keys.type.${type}`)}
            </p>
            <p className="text-muted-foreground">
              {t(`org-pages.api-keys.type-hint.${type}`)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** API keys of an organization: VIEWER+ read (masked below ADMIN), ADMIN+ create and delete. */
export default function ApiKeysPage() {
  const { t, i18n } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const { canManage, canCreateMcp, roleLoading, roleUnavailable } =
    useOrgRole(orgId)
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [projects, setProjects] = useState<OrgProjectEnvironments[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState<{
    name: string
    type: ApiKeyType
    key: string
    command?: string
  } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<ApiKey | null>(null)
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    const current = () => id === loadId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const response = await api.get(`/api-keys/organization/${orgId}`)
      if (!current()) return
      const list: ApiKey[] = response.data.apiKeys ?? []
      setKeys(list)
      // Project and environment names are secondary: failures stay silent.
      api
        .get(`/projects/organization/${orgId}`)
        .then((res) => {
          if (current()) setProjects(res.data.projects ?? [])
        })
        .catch(() => {})
    } catch {
      if (current()) setLoadError(true)
    } finally {
      if (current()) setIsLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (orgId) load()
  }, [orgId, load])

  const create = async (input: NewApiKey) => {
    try {
      const response = await api.post(`/api-keys/organization/${orgId}`, input)
      const apiKey: ApiKey | undefined = response.data.apiKey
      setCreateOpen(false)
      if (apiKey?.key) {
        setCreated({
          name: apiKey.name,
          type: apiKey.type,
          key: apiKey.key,
          ...(apiKey.type === 'MCP'
            ? {
                command: mcpAddCommand(
                  api.defaults?.baseURL ?? '/api',
                  apiKey.key
                ),
              }
            : {}),
        })
      }
      load()
    } catch (error) {
      handleForbidden(error, t)
      throw new Error(apiMessage(error, t('org-pages.api-keys.create-failed')))
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await api.delete(`/api-keys/${deleting.id}`)
      setKeys((list) => list.filter((k) => k.id !== deleting.id))
      toast.success(t('org-pages.api-keys.deleted', { name: deleting.name }))
    } catch (error) {
      handleForbidden(error, t)
      throw new Error(apiMessage(error, t('org-pages.api-keys.delete-failed')))
    }
  }

  const loadEnvironments = useCallback(
    async (projectId: string): Promise<ProjectEnvironment[]> => {
      const response = await api.get(`/environments/project/${projectId}`)
      return response.data.environments ?? []
    },
    []
  )

  const canDelete = (apiKey: ApiKey) =>
    canManage ||
    (canCreateMcp &&
      apiKey.type === 'MCP' &&
      Boolean(apiKey.userId) &&
      apiKey.userId === currentUserId)

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  )
  const envNames = useMemo(() => {
    const names = new Map<string, { project: string; env: string }>()
    for (const project of projects) {
      for (const env of project.environments ?? []) {
        names.set(env.id, { project: project.name, env: env.name })
      }
    }
    return names
  }, [projects])

  const copy = async (apiKey: ApiKey) => {
    try {
      await navigator.clipboard.writeText(apiKey.key)
      toast.success(t('org-pages.api-keys.copied'))
    } catch {
      toast.error(t('invites.copy-failed'))
    }
  }

  const formatDate = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString(i18n.language)
  }

  const hasBoundKeys = useMemo(
    () => keys.some((k) => k.environmentId || k.type === 'MCP'),
    [keys]
  )

  const columns: DataTableColumn<ApiKey>[] = [
    {
      key: 'name',
      header: t('org-pages.api-keys.col-name'),
      cell: (apiKey) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{apiKey.name}</p>
          <code className="block truncate font-mono text-xs text-muted-foreground">
            {displayKey(apiKey.key)}
          </code>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('org-pages.api-keys.col-type'),
      width: '7rem',
      cell: (apiKey) => (
        <Badge
          variant="neutral"
          title={t(`org-pages.api-keys.type-hint.${apiKey.type}`)}
        >
          {t(`org-pages.api-keys.type.${apiKey.type}`)}
        </Badge>
      ),
    },
  ]
  if (hasBoundKeys) {
    columns.push({
      key: 'environment',
      header: t('org-pages.api-keys.col-environment'),
      hideBelow: 'lg',
      cell: (apiKey) => {
        if (apiKey.type === 'MCP') {
          const toggles = (apiKey.allowedEnvironmentIds ?? [])
            .map((id) => envNames.get(id)?.env ?? id)
            .join(', ')
          return (
            <div className="min-w-0">
              <p className="truncate">
                {(apiKey.projectId && projectNames.get(apiKey.projectId)) ||
                  apiKey.projectId ||
                  '–'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t('org-pages.api-keys.toggles-in', { envs: toggles || '–' })}
              </p>
            </div>
          )
        }
        if (!apiKey.environmentId) {
          return (
            <span className="text-muted-foreground">
              {t('org-pages.api-keys.env-all')}
            </span>
          )
        }
        const named = envNames.get(apiKey.environmentId)
        return named ? (
          `${named.project} · ${named.env}`
        ) : (
          <code className="font-mono text-xs">{apiKey.environmentId}</code>
        )
      },
    })
  }
  columns.push(
    {
      key: 'created',
      header: t('org-pages.api-keys.col-created'),
      width: '8rem',
      hideBelow: 'md',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (apiKey) => formatDate(apiKey.createdAt) ?? '–',
    },
    {
      key: 'last-used',
      header: t('org-pages.api-keys.col-last-used'),
      width: '8rem',
      hideBelow: 'md',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (apiKey) =>
        formatDate(apiKey.lastUsedAt) ?? t('org-pages.api-keys.never-used'),
    },
    {
      key: 'expires',
      header: t('org-pages.api-keys.col-expires'),
      width: '9rem',
      hideBelow: 'sm',
      className: 'whitespace-nowrap',
      cell: (apiKey) => {
        const state = expiryState(apiKey.expiresAt)
        if (state === 'never') {
          return (
            <span className="text-muted-foreground">
              {t('org-pages.api-keys.expires-never')}
            </span>
          )
        }
        const date = formatDate(apiKey.expiresAt)
        if (state === 'expired') {
          return (
            <Badge variant="destructive">
              {t('org-pages.api-keys.expired', { date })}
            </Badge>
          )
        }
        if (state === 'soon') return <Badge variant="warning">{date}</Badge>
        return <span className="text-muted-foreground">{date}</span>
      },
    }
  )
  if (canManage || canCreateMcp) {
    columns.push({
      key: 'actions',
      header: t('org-pages.api-keys.col-actions'),
      srOnlyHeader: true,
      width: '6rem',
      align: 'right',
      className: 'px-2',
      cell: (apiKey) => (
        <div className="flex justify-end gap-1">
          {canManage && apiKey.type !== 'MCP' && !apiKey.key.includes('…') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => copy(apiKey)}
              aria-label={t('org-pages.api-keys.copy-label', {
                name: apiKey.name,
              })}
              title={t('org-pages.api-keys.copy')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {canDelete(apiKey) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => {
                setDeleting(apiKey)
                setDeleteOpen(true)
              }}
              aria-label={t('org-pages.api-keys.delete-label', {
                name: apiKey.name,
              })}
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    })
  }

  const createButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('org-pages.api-keys.create')}
    </Button>
  )

  const loading = isLoading || roleLoading
  let content: React.ReactNode
  if (loading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(k) => k.id}
        loading
        loadingRows={3}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('org-pages.api-keys.load-error')} onRetry={load} />
    )
  } else if (keys.length === 0) {
    content = (
      <EmptyState
        icon={<KeyRound className="h-5 w-5" />}
        title={t('org-pages.api-keys.empty-title')}
        description={
          canCreateMcp
            ? t('org-pages.api-keys.empty-text')
            : t('org-pages.api-keys.empty-text-readonly')
        }
        action={canCreateMcp ? createButton : undefined}
      />
    )
  } else {
    content = (
      <div className="space-y-2">
        {!canManage && !roleUnavailable && (
          <p className="text-xs text-muted-foreground">
            {t('org-pages.api-keys.masked-hint')}
          </p>
        )}
        <DataTable
          columns={columns}
          rows={keys}
          getRowId={(k) => k.id}
          label={t('org-pages.api-keys.title')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('org-pages.api-keys.title')}
        description={t('org-pages.api-keys.subtitle')}
        actions={
          canCreateMcp && !loading && !loadError && keys.length > 0
            ? createButton
            : undefined
        }
      />
      <RoleUnavailableNotice show={roleUnavailable} />
      <KeyTypesInfo />
      {content}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={create}
        types={canManage ? CREATE_KEY_TYPES : MCP_ONLY}
        projects={projects}
        loadEnvironments={loadEnvironments}
      />
      <ApiKeyCreatedDialog created={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('org-pages.api-keys.delete-title')}
        description={t('org-pages.api-keys.delete-description', {
          name: deleting?.name ?? '',
        })}
        confirmLabel={t('org-pages.api-keys.delete-confirm')}
        onConfirm={remove}
      />
    </div>
  )
}
