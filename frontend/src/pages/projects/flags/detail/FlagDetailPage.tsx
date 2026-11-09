import { Copy, Flag, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import api from '@/lib/api'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { handleForbidden, useProjectRole } from '@/lib/permissions'
import { projectPath, ROUTES } from '@/lib/routes'
import { EditFlagDialog } from './EditFlagDialog'
import { FlagBrandsTab } from './FlagBrandsTab'
import { FlagEnvironmentsTab } from './FlagEnvironmentsTab'
import { FlagHistoryTab } from './FlagHistoryTab'
import { FlagMeta } from './FlagMeta'
import { FlagTargetingTab } from './FlagTargetingTab'
import {
  type BrandEnvironment,
  type EnvironmentState,
  type FlagDetail,
  type FlagTab,
  isFlagTab,
  isValidObjectId,
  normalizeBrandEnvironments,
  normalizeEnvironments,
  normalizeFlag,
  type RawApi,
} from './types'

type LoadError =
  | { kind: 'not-found' }
  | { kind: 'failed'; message: string }
  | null

/** The parts of `GET /projects/:id` this page needs. */
interface DetailProject {
  id: string
  key: string
  type: 'SINGLE' | 'MULTI'
  environments?: { id: string; key: string; name: string }[]
}

/** Flag detail: header with actions and the tabs environments · targeting · brands · history. */
export default function FlagDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId = '', flagId: flagIdParam } = useParams<{
    projectId: string
    flagId: string
  }>()
  const flagId = isValidObjectId(flagIdParam) ? flagIdParam : null
  const flagsHref = projectId
    ? projectPath(projectId, 'flags')
    : ROUTES.overview
  const [searchParams, setSearchParams] = useSearchParams()
  // Backend: MEMBER+ edits values/details/rules, ADMIN+ deletes the flag.
  const { canEdit, canManage, roleUnavailable } = useProjectRole(projectId)

  // Type and key from GET /projects/:id (like the flags list): the workspace
  // cache may be stale after a type change.
  const [project, setProject] = useState<DetailProject | null>(null)
  const validFlagId = flagId !== null
  const [projectLoading, setProjectLoading] = useState(
    Boolean(projectId) && validFlagId
  )
  useEffect(() => {
    // An invalid flag id shows "not found" without any request.
    if (!projectId || !validFlagId) {
      setProjectLoading(false)
      return
    }
    let cancelled = false
    setProjectLoading(true)
    api
      .get(`/projects/${projectId}`)
      .then((response) => {
        if (cancelled) return
        const data = response.data?.project ?? response.data
        setProject(data?.id ? data : null)
      })
      .catch(() => {
        if (!cancelled) setProject(null)
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, validFlagId])
  const isMulti = project?.type === 'MULTI'

  const [flag, setFlag] = useState<FlagDetail | null>(null)
  const [environments, setEnvironments] = useState<EnvironmentState[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(flagId))
  const [loadError, setLoadError] = useState<LoadError>(
    flagId ? null : { kind: 'not-found' }
  )
  const [reloadToken, setReloadToken] = useState(0)
  const [brandEnvironments, setBrandEnvironments] = useState<
    BrandEnvironment[] | null
  >(null)
  const [brandError, setBrandError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  /** Bumped per brand load; results for another flag/project are dropped. */
  const brandLoadId = useRef(0)

  // Brand values belong to one flag: drop them when the flag changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on flagId change only
  useEffect(() => {
    brandLoadId.current++
    setBrandEnvironments(null)
    setBrandError(null)
  }, [flagId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken triggers a manual retry
  useEffect(() => {
    if (!flagId) {
      setIsLoading(false)
      setLoadError({ kind: 'not-found' })
      return
    }
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [flagRes, envRes] = await Promise.all([
          api.get(`/feature-flags/${flagId}`),
          api.get(`/feature-flags/${flagId}/environments`),
        ])
        if (cancelled) return
        setFlag(normalizeFlag(flagRes.data.featureFlag))
        setEnvironments(normalizeEnvironments(envRes.data.environments))
      } catch (error) {
        if (cancelled) return
        setFlag(null)
        const status = getErrorStatus(error)
        setLoadError(
          status === 404 || status === 400
            ? { kind: 'not-found' }
            : { kind: 'failed', message: getErrorMessage(error) }
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [flagId, reloadToken])

  const loadBrandValues = useCallback(async () => {
    if (!flagId || !projectId) return
    const id = ++brandLoadId.current
    setBrandError(null)
    try {
      const response = await api.get(`/projects/${projectId}/flags-with-brands`)
      if (id !== brandLoadId.current) return
      const rawFlag = (response.data?.flags ?? []).find(
        (f: RawApi) => f.id === flagId
      )
      setBrandEnvironments(normalizeBrandEnvironments(rawFlag))
    } catch (error) {
      if (id === brandLoadId.current) setBrandError(getErrorMessage(error))
    }
  }, [flagId, projectId])

  const loadedFlagId = flag?.id
  useEffect(() => {
    if (isMulti && loadedFlagId) void loadBrandValues()
  }, [isMulti, loadedFlagId, loadBrandValues])

  /** MULTI: reloads default states and brand values after a change. */
  const refreshValues = useCallback(async () => {
    if (!flagId) return
    try {
      const envRes = await api.get(`/feature-flags/${flagId}/environments`)
      setEnvironments(normalizeEnvironments(envRes.data.environments))
    } catch {
      // The brand reload below surfaces errors.
    }
    await loadBrandValues()
  }, [flagId, loadBrandValues])

  // Tab from `?tab=`; "brands" only for MULTI projects (once that is known).
  const rawTab = searchParams.get('tab')
  const brandsUnavailable = !isMulti && !projectLoading
  const activeTab: FlagTab =
    isFlagTab(rawTab) && !(rawTab === 'brands' && brandsUnavailable)
      ? rawTab
      : 'environments'

  const changeTab = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'environments') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true }
    )
  }

  // Targeting keeps its state (form, environment) across tab switches: once
  // visited it stays mounted and is only hidden.
  const [targetingVisited, setTargetingVisited] = useState(
    activeTab === 'targeting'
  )
  useEffect(() => {
    if (activeTab === 'targeting') setTargetingVisited(true)
  }, [activeTab])

  const copy = async (text: string, success: string, failure: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(success)
    } catch {
      toast.error(failure)
    }
  }
  const copyKey = () =>
    flag &&
    copy(
      flag.key,
      t('flag-detail.key-copied'),
      t('flag-detail.key-copy-failed')
    )
  const copyId = () =>
    flag &&
    copy(
      flag.id,
      t('flag-detail.meta.id-copied'),
      t('flag-detail.meta.id-copy-failed')
    )

  const saveDetails = async (values: { name: string; description: string }) => {
    if (!flag) return
    try {
      await api.patch(`/feature-flags/${flag.id}`, values)
    } catch (error) {
      handleForbidden(error, t) // the dialog shows the message
      throw error
    }
    setFlag((prev) =>
      prev
        ? {
            ...prev,
            name: values.name,
            description: values.description || null,
          }
        : prev
    )
    toast.success(t('flag-detail.edit.saved'))
  }

  /** Rejects on failure: the confirm dialog stays open with the error. */
  const deleteFlag = async () => {
    if (!flag) return
    try {
      await api.delete(`/feature-flags/${flag.id}`)
    } catch (error) {
      handleForbidden(error, t)
      throw error
    }
    toast.success(t('flag-detail.delete.deleted', { name: flag.name }))
    navigate(flagsHref)
  }

  const breadcrumb = (name?: string) => [
    { label: t('flag-detail.breadcrumb'), to: flagsHref },
    ...(name ? [{ label: name }] : []),
  ]

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        <div className="space-y-2 border-b pb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-80 max-w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }

  if (!flag) {
    const backLink = (
      <Button variant="outline" asChild>
        <Link to={flagsHref}>{t('flag-detail.back')}</Link>
      </Button>
    )
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumb={breadcrumb()}
          title={t('flag-detail.title-fallback')}
        />
        {loadError?.kind === 'failed' ? (
          <div className="space-y-4">
            <ErrorState
              title={t('flag-detail.load-error')}
              message={loadError.message}
              onRetry={() => setReloadToken((n) => n + 1)}
            />
            <div className="flex justify-center">{backLink}</div>
          </div>
        ) : (
          <EmptyState
            icon={<Flag className="h-5 w-5" />}
            title={t('flag-detail.not-found-title')}
            description={t('flag-detail.not-found-description')}
            action={backLink}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={breadcrumb(flag.name)}
        title={flag.name}
        meta={<Badge variant="neutral">{flag.type}</Badge>}
        description={
          <span className="flex flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1">
              <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {flag.key}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => void copyKey()}
                aria-label={t('flag-detail.copy-key')}
                title={t('flag-detail.copy-key')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
            {flag.description && <span>{flag.description}</span>}
            <FlagMeta flag={flag} onCopyId={() => void copyId()} />
          </span>
        }
        actions={
          canEdit || canManage ? (
            <>
              {canManage && (
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {t('common.delete')}
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {t('common.edit')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <RoleUnavailableNotice show={roleUnavailable} />

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="environments">
            {t('flag-detail.tabs.environments')}
          </TabsTrigger>
          <TabsTrigger value="targeting">
            {t('flag-detail.tabs.targeting')}
          </TabsTrigger>
          {(isMulti || (projectLoading && activeTab === 'brands')) && (
            <TabsTrigger value="brands">
              {t('flag-detail.tabs.brands')}
            </TabsTrigger>
          )}
          <TabsTrigger value="history">
            {t('flag-detail.tabs.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="environments" className="mt-4">
          <FlagEnvironmentsTab
            flag={flag}
            environments={environments}
            onEnvironmentsChange={setEnvironments}
            isMulti={isMulti}
            brandEnvironments={brandEnvironments}
            brandError={brandError}
            onRefresh={refreshValues}
            readOnly={!canEdit}
            sdk={
              project
                ? {
                    projectKey: project.key,
                    environmentKey:
                      project.environments?.[0]?.key ?? 'development',
                  }
                : null
            }
          />
        </TabsContent>
        <TabsContent
          value="targeting"
          className="mt-4"
          forceMount={targetingVisited || undefined}
          hidden={activeTab !== 'targeting'}
        >
          <FlagTargetingTab
            flagId={flag.id}
            flagType={flag.type}
            environments={environments}
            readOnly={!canEdit}
          />
        </TabsContent>
        {isMulti && (
          <TabsContent value="brands" className="mt-4">
            <FlagBrandsTab
              projectId={projectId}
              flagType={flag.type}
              brandEnvironments={brandEnvironments}
              brandError={brandError}
              onRetry={() => void loadBrandValues()}
            />
          </TabsContent>
        )}
        <TabsContent value="history" className="mt-4">
          <FlagHistoryTab
            projectId={projectId || flag.projectId}
            flagId={flag.id}
          />
        </TabsContent>
      </Tabs>

      <EditFlagDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        name={flag.name}
        description={flag.description}
        onSave={saveDetails}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('flag-detail.delete.title')}
        description={t('flag-detail.delete.description', {
          name: flag.name,
          key: flag.key,
        })}
        confirmLabel={t('common.delete')}
        onConfirm={deleteFlag}
      />
    </div>
  )
}
