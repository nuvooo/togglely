import { Layers } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { FlagValueDialog } from '@/components/flags/FlagValueDialog'
import { FlagValueRow, LinkLegend } from '@/components/flags/FlagValueRow'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import type {
  BrandEnvironment,
  BrandValue,
  EnvironmentState,
  FlagDetail,
} from './types'

/** Target of the value editor: an environment default or one brand. */
interface EditTarget {
  environmentId: string
  environmentName: string
  value: string
  brand?: BrandValue
}

interface FlagEnvironmentsTabProps {
  flag: FlagDetail
  environments: EnvironmentState[]
  onEnvironmentsChange: (
    update: (prev: EnvironmentState[]) => EnvironmentState[]
  ) => void
  isMulti: boolean
  /** MULTI only: environments with brand values (null while loading). */
  brandEnvironments: BrandEnvironment[] | null
  brandError: string | null
  /** MULTI only: reloads environments and brand values after a change. */
  onRefresh: () => Promise<void>
}

/** Values and switches of the flag per environment (MULTI: per brand too). */
export function FlagEnvironmentsTab({
  flag,
  environments,
  onEnvironmentsChange,
  isMulti,
  brandEnvironments,
  brandError,
  onRefresh,
}: FlagEnvironmentsTabProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const editable = flag.type !== 'BOOLEAN'

  const openEditor = (target: EditTarget) => {
    setEditing(target)
    setEditorOpen(true)
  }

  /** Marks `rowKey` busy while `request` runs; errors end in a toast. */
  const run = async (rowKey: string, request: () => Promise<void>) => {
    setBusy((prev) => new Set(prev).add(rowKey))
    try {
      await request()
    } catch (error) {
      toast.error(getErrorMessage(error))
      if (isMulti) await onRefresh()
    } finally {
      setBusy((prev) => {
        const next = new Set(prev)
        next.delete(rowKey)
        return next
      })
    }
  }

  /** Toggles the environment default (inheriting brands follow it). */
  const toggleDefault = (environmentId: string, enabled: boolean) =>
    run(`${environmentId}-default`, async () => {
      await api.patch(
        `/feature-flags/${flag.id}/environments/${environmentId}`,
        { isEnabled: enabled }
      )
      onEnvironmentsChange((prev) =>
        prev.map((env) =>
          env.id === environmentId
            ? {
                ...env,
                isEnabled: enabled,
                // BOOLEAN flags keep value and switch in sync
                ...(flag.type === 'BOOLEAN' && { value: String(enabled) }),
              }
            : env
        )
      )
      if (isMulti) await onRefresh()
    })

  /** Toggles a brand; an inheriting brand gets its own override row. */
  const toggleBrand = (
    env: BrandEnvironment,
    brand: BrandValue,
    enabled: boolean
  ) =>
    run(`${env.environmentId}-${brand.brandId}`, async () => {
      await api.post(`/brands/${brand.brandId}/flags/${flag.id}/toggle`, {
        environmentId: env.environmentId,
        enabled,
      })
      await onRefresh()
    })

  /** Link toggle: unlink creates an own row with the current values, link deletes it. */
  const changeLink = (
    env: BrandEnvironment,
    brand: BrandValue,
    link: boolean
  ) =>
    run(`${env.environmentId}-${brand.brandId}`, async () => {
      if (link) {
        await api.delete(
          `/brands/${brand.brandId}/flags/${flag.id}/environments/${env.environmentId}`
        )
        toast.success(
          t('brand-values.relinked', {
            name: brand.brandName,
            value:
              flag.type === 'BOOLEAN'
                ? t(
                    env.enabled
                      ? 'brand-values.state-on'
                      : 'brand-values.state-off'
                  )
                : env.value,
          })
        )
      } else {
        await api.post(`/brands/${brand.brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled: brand.enabled,
        })
      }
      await onRefresh()
    })

  /** Saves the edited value; with a brand this creates/updates its override. */
  const saveValue = async (value: string) => {
    if (!editing) return
    const { environmentId, brand } = editing
    await api.patch(
      `/feature-flags/${flag.id}/environments/${environmentId}/value`,
      brand ? { value, brandId: brand.brandId } : { value }
    )
    if (isMulti) {
      await onRefresh()
    } else {
      onEnvironmentsChange((prev) =>
        prev.map((env) => (env.id === environmentId ? { ...env, value } : env))
      )
    }
  }

  const noEnvironments = (
    <EmptyState
      icon={<Layers className="h-5 w-5" />}
      title={t('flag-detail.environments.empty-title')}
      description={t('flag-detail.environments.empty-description')}
    />
  )

  let content: React.ReactNode
  if (!isMulti) {
    content =
      environments.length === 0 ? (
        noEnvironments
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => (
            <FlagValueRow
              key={env.id}
              primary
              label={env.name}
              name={env.name}
              flagType={flag.type}
              enabled={env.isEnabled}
              value={env.value}
              busy={busy.has(`${env.id}-default`)}
              onToggle={(next) => void toggleDefault(env.id, next)}
              onEdit={
                editable
                  ? () =>
                      openEditor({
                        environmentId: env.id,
                        environmentName: env.name,
                        value: env.value,
                      })
                  : undefined
              }
            />
          ))}
        </div>
      )
  } else if (brandError) {
    content = (
      <ErrorState
        title={t('flag-detail.environments.load-error')}
        message={brandError}
        onRetry={() => void onRefresh()}
      />
    )
  } else if (!brandEnvironments) {
    content = (
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
      >
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  } else if (brandEnvironments.length === 0) {
    content = noEnvironments
  } else {
    content = (
      <div className="space-y-3">
        <LinkLegend />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brandEnvironments.map((env) => (
            <section
              key={env.environmentId}
              data-testid={`env-card-${env.environmentId}`}
              aria-label={env.environmentName}
              className="rounded-lg border bg-muted/40 p-3"
            >
              <h3 className="mb-2 border-b pb-2 text-sm font-semibold">
                {env.environmentName}
              </h3>
              <div className="space-y-2">
                <FlagValueRow
                  primary
                  label={t('brand-values.default-all')}
                  name={`${env.environmentName} ${t('brand-values.default-all')}`}
                  flagType={flag.type}
                  enabled={env.enabled}
                  value={env.value}
                  busy={busy.has(`${env.environmentId}-default`)}
                  onToggle={(next) =>
                    void toggleDefault(env.environmentId, next)
                  }
                  onEdit={
                    editable
                      ? () =>
                          openEditor({
                            environmentId: env.environmentId,
                            environmentName: env.environmentName,
                            value: env.value,
                          })
                      : undefined
                  }
                />
                {env.brands.map((brand) => (
                  <FlagValueRow
                    key={brand.brandId}
                    label={brand.brandName}
                    name={`${env.environmentName} ${brand.brandName}`}
                    flagType={flag.type}
                    enabled={brand.enabled}
                    value={brand.value}
                    linked={brand.inherited}
                    onLinkChange={(link) => void changeLink(env, brand, link)}
                    busy={busy.has(`${env.environmentId}-${brand.brandId}`)}
                    onToggle={(next) => void toggleBrand(env, brand, next)}
                    onEdit={
                      editable
                        ? () =>
                            openEditor({
                              environmentId: env.environmentId,
                              environmentName: env.environmentName,
                              value: brand.value,
                              brand,
                            })
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {t('flag-detail.environments.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isMulti
            ? t('flag-detail.environments.description-multi')
            : t('flag-detail.environments.description')}
        </p>
      </div>
      {content}
      <FlagValueDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        flagType={flag.type}
        flagName={flag.name}
        environmentName={editing?.environmentName ?? ''}
        targetName={
          !isMulti
            ? undefined
            : editing?.brand
              ? editing.brand.brandName
              : t('brand-values.default-all')
        }
        initialValue={editing?.value ?? ''}
        hint={
          editing?.brand?.inherited
            ? t('brand-values.edit-creates-override')
            : undefined
        }
        onSave={saveValue}
      />
    </div>
  )
}
