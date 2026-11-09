import { ArrowLeft, Building2, Flag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FlagValueDialog } from '@/components/flags/FlagValueDialog'
import { FlagValueRow, LinkLegend } from '@/components/flags/FlagValueRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { projectPath, ROUTES } from '@/lib/routes'

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

export default function BrandFlags() {
  const { t } = useTranslation()
  const { projectId = '', brandId } = useParams<{
    projectId: string
    brandId: string
  }>()
  const navigate = useNavigate()

  const [brand, setBrand] = useState<Brand | null>(null)
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set())

  // Value editor. `editing` outlives `editorOpen` so the dialog keeps its
  // content while it animates out; the next open replaces it.
  const [editing, setEditing] = useState<{
    flag: FeatureFlag
    env: FlagEnvironment
  } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    if (!brandId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        const response = await api.get(`/brands/${brandId}/flags`)
        setBrand(response.data.brand)
        setFlags(response.data.flags)
      } catch (error) {
        console.error('Failed to fetch brand flags:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [brandId])

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!brand) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Brand not found</p>
        <Button
          className="mt-4"
          onClick={() => navigate(projectPath(projectId, 'settings'))}
        >
          Back to Settings
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to={ROUTES.orgs}
          className="hover:text-foreground transition-colors"
        >
          Organizations
        </Link>
        <span>/</span>
        <Link
          to={projectPath(projectId, 'settings')}
          className="hover:text-foreground transition-colors"
        >
          Project Settings
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{brand.name} Flags</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(projectPath(projectId, 'settings'))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {brand.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                Brand-specific feature flags
              </p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Flags List */}
      <div className="space-y-4">
        {flags.length > 0 && <LinkLegend />}
        {flags.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Flag className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No feature flags</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                This project has no feature flags yet. Create flags in the
                project first.
              </p>
            </CardContent>
          </Card>
        ) : (
          flags.map((flag) => (
            <Card key={flag.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
                      <Flag className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{flag.name}</CardTitle>
                        <Badge variant="outline">{flag.flagType}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">
                        {flag.key}
                      </p>
                      {flag.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {flag.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          link
                            ? handleRelink(flag, env)
                            : handleUnlink(flag, env)
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
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
