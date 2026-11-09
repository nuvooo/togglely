import { Building2, Flag } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { FlagValueDialog } from '@/components/flags/FlagValueDialog'
import { FlagValueRow, LinkLegend } from '@/components/flags/FlagValueRow'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/axios'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { flagPath, projectPath } from '@/lib/routes'

interface Brand {
  id: string
  name: string
  key: string
  description: string | null
}

/** Effective brand value in one environment (inherited = no own row). */
interface FlagEnvironment {
  id: string
  environmentId: string
  environmentName: string
  enabled: boolean
  defaultValue: string
  inherited?: boolean
  isBrandSpecific: boolean
  default?: { enabled: boolean; defaultValue: string }
}

interface FeatureFlag {
  id: string
  name: string
  key: string
  description: string | null
  flagType: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
  environments: FlagEnvironment[]
}

const isInherited = (env: FlagEnvironment) =>
  env.inherited ?? !env.isBrandSpecific

/** Flags of one brand: per environment either inherited (linked) or an own value. */
export default function BrandDetailPage() {
  const { t } = useTranslation()
  const { projectId = '', brandId } = useParams<{
    projectId: string
    brandId: string
  }>()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(
    null
  )
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set())

  // Value editor. `editing` outlives `editorOpen` so the dialog keeps its
  // content while it animates out; the next open replaces it.
  const [editing, setEditing] = useState<{
    flag: FeatureFlag
    env: FlagEnvironment
  } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const load = useCallback(async () => {
    if (!brandId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await api.get(`/brands/${brandId}/flags`)
      setBrand(response.data.brand ?? null)
      setFlags(response.data.flags ?? [])
      if (!response.data.brand) setLoadError('not-found')
    } catch (error) {
      setLoadError(getErrorStatus(error) === 404 ? 'not-found' : 'failed')
    } finally {
      setIsLoading(false)
    }
  }, [brandId])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async () => {
    try {
      const response = await api.get(`/brands/${brandId}/flags`)
      setFlags(response.data.flags)
    } catch (error) {
      console.error('Failed to refresh brand flags:', error)
    }
  }

  const patchEnv = (
    flagId: string,
    environmentId: string,
    patch: (env: FlagEnvironment) => FlagEnvironment
  ) =>
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flagId
          ? {
              ...f,
              environments: f.environments.map((e) =>
                e.environmentId === environmentId ? patch(e) : e
              ),
            }
          : f
      )
    )

  /**
   * Optimistic update → request → refetch. On error: toast and refetch (no
   * snapshot restore, which could revert concurrent changes of other rows).
   */
  const mutate = async (
    rowKey: string,
    optimistic: () => void,
    request: () => Promise<unknown>,
    onSuccess?: () => void
  ) => {
    optimistic()
    setBusyRows((prev) => new Set(prev).add(rowKey))
    try {
      await request()
      onSuccess?.()
      await refresh()
    } catch (error) {
      toast.error(getErrorMessage(error))
      await refresh()
    } finally {
      setBusyRows((prev) => {
        const next = new Set(prev)
        next.delete(rowKey)
        return next
      })
    }
  }

  /** Toggling an inheriting brand creates its override. */
  const handleToggle = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    enabled: boolean
  ) => {
    if (!brandId) return
    mutate(
      `${flag.id}-${env.environmentId}`,
      () =>
        patchEnv(flag.id, env.environmentId, (e) => ({
          ...e,
          enabled,
          inherited: false,
          isBrandSpecific: true,
          ...(flag.flagType === 'BOOLEAN' && {
            defaultValue: String(enabled),
          }),
        })),
      () =>
        api.post(`/brands/${brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled,
        })
    )
  }

  /**
   * Unlinks: creates the brand's own row seeded with the current (default)
   * values; the value itself does not change.
   */
  const handleUnlink = (flag: FeatureFlag, env: FlagEnvironment) => {
    if (!brandId) return
    mutate(
      `${flag.id}-${env.environmentId}`,
      () =>
        patchEnv(flag.id, env.environmentId, (e) => ({
          ...e,
          inherited: false,
          isBrandSpecific: true,
        })),
      () =>
        api.post(`/brands/${brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled: env.enabled,
        })
    )
  }

  /** Re-links: deletes the override, the brand follows the default again. */
  const handleRelink = (flag: FeatureFlag, env: FlagEnvironment) => {
    if (!brandId) return
    const enabled = env.default?.enabled ?? env.enabled
    const defaultValue = env.default?.defaultValue ?? env.defaultValue
    mutate(
      `${flag.id}-${env.environmentId}`,
      () =>
        patchEnv(flag.id, env.environmentId, (e) => ({
          ...e,
          enabled,
          defaultValue,
          inherited: true,
          isBrandSpecific: false,
        })),
      () =>
        api.delete(
          `/brands/${brandId}/flags/${flag.id}/environments/${env.environmentId}`
        ),
      () =>
        toast.success(
          t('brand-values.relinked', {
            name: brand?.name ?? '',
            value:
              flag.flagType === 'BOOLEAN'
                ? t(
                    enabled ? 'brand-values.state-on' : 'brand-values.state-off'
                  )
                : defaultValue,
          })
        )
    )
  }

  const handleSaveValue = async (value: string) => {
    if (!brandId || !editing) return
    await api.patch(
      `/feature-flags/${editing.flag.id}/environments/${editing.env.environmentId}/value`,
      { value, brandId }
    )
    await refresh()
  }

  const brandsLink = projectPath(projectId, 'brands')
  const breadcrumb = [
    { label: t('brands-page.title'), to: brandsLink },
    { label: brand?.name ?? '…' },
  ]

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
        <PageHeader
          title={<Skeleton className="h-6 w-40" />}
          breadcrumb={breadcrumb}
        />
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError || !brand) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title={t('brands-page.detail.title-fallback')}
          breadcrumb={breadcrumb}
        />
        {loadError === 'failed' ? (
          <ErrorState
            message={t('brands-page.detail.load-error')}
            onRetry={load}
          />
        ) : (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={t('brands-page.detail.not-found-title')}
            description={t('brands-page.detail.not-found-text')}
            action={
              <Button variant="outline" asChild>
                <Link to={brandsLink}>{t('brands-page.detail.back')}</Link>
              </Button>
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={brand.name}
        breadcrumb={breadcrumb}
        meta={
          <Badge variant="outline" className="font-mono">
            {brand.key}
          </Badge>
        }
        description={brand.description || t('brands-page.detail.subtitle')}
      />

      {flags.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-5 w-5" />}
          title={t('brands-page.detail.empty-title')}
          description={t('brands-page.detail.empty-text')}
          action={
            <Button variant="outline" asChild>
              <Link to={projectPath(projectId, 'flags')}>
                {t('brands-page.detail.to-flags')}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <LinkLegend />
          {flags.map((flag) => (
            <section
              key={flag.id}
              aria-labelledby={`brand-flag-${flag.id}`}
              className="rounded-lg border bg-card p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2
                  id={`brand-flag-${flag.id}`}
                  className="text-sm font-semibold"
                >
                  <Link
                    to={flagPath(projectId, flag.id)}
                    className="hover:underline"
                  >
                    {flag.name}
                  </Link>
                </h2>
                <code className="font-mono text-xs text-muted-foreground">
                  {flag.key}
                </code>
                <Badge variant="neutral">{flag.flagType}</Badge>
              </div>
              {flag.description && (
                <p className="-mt-2 mb-3 text-xs text-muted-foreground">
                  {flag.description}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {flag.environments.map((env) => {
                  const inherited = isInherited(env)
                  return (
                    <FlagValueRow
                      key={env.environmentId}
                      primary
                      label={env.environmentName}
                      name={`${env.environmentName} ${brand.name}`}
                      flagType={flag.flagType}
                      enabled={env.enabled}
                      value={env.defaultValue}
                      linked={inherited}
                      onLinkChange={(link) =>
                        link ? handleRelink(flag, env) : handleUnlink(flag, env)
                      }
                      busy={busyRows.has(`${flag.id}-${env.environmentId}`)}
                      onToggle={(next) => handleToggle(flag, env, next)}
                      onEdit={
                        flag.flagType !== 'BOOLEAN'
                          ? () => {
                              setEditing({ flag, env })
                              setEditorOpen(true)
                            }
                          : undefined
                      }
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <FlagValueDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        flagType={editing?.flag.flagType ?? 'STRING'}
        flagName={editing?.flag.name ?? ''}
        environmentName={editing?.env.environmentName ?? ''}
        targetName={brand.name}
        initialValue={editing?.env.defaultValue ?? ''}
        hint={
          editing && isInherited(editing.env)
            ? t('brand-values.edit-creates-override')
            : undefined
        }
        onSave={handleSaveValue}
      />
    </div>
  )
}
