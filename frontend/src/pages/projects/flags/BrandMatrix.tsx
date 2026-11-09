import { useTranslation } from 'react-i18next'
import { FlagValueRow, LinkLegend } from '@/components/flags/FlagValueRow'
import type {
  BrandFlagValue,
  EditingValue,
  FeatureFlag,
  FlagEnvironment,
  ProjectEnvironment,
} from './types'
import { brandRowKey, defaultRowKey } from './useProjectFlags'

export interface BrandMatrixActions {
  isBusy: (key: string) => boolean
  toggleDefault: (
    flag: FeatureFlag,
    env: FlagEnvironment,
    enabled: boolean
  ) => void
  toggleBrand: (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue,
    enabled: boolean
  ) => void
  unlinkBrand: (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue
  ) => void
  relinkBrand: (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue
  ) => void
}

interface BrandMatrixProps extends BrandMatrixActions {
  flag: FeatureFlag
  /** Column order of the table (API order). */
  environments: ProjectEnvironment[]
  onEdit: (value: EditingValue) => void
}

/** Orders a flag's environments like the table columns; unknown ones last. */
function ordered(flag: FeatureFlag, environments: ProjectEnvironment[]) {
  const rank = new Map(environments.map((env, index) => [env.id, index]))
  return [...(flag.environments ?? [])].sort(
    (a, b) =>
      (rank.get(a.environmentId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.environmentId) ?? Number.MAX_SAFE_INTEGER)
  )
}

/**
 * Brand values of one flag (MULTI projects): one card per environment with
 * the default first, then every brand (inheriting or own value).
 */
export function BrandMatrix({
  flag,
  environments,
  onEdit,
  isBusy,
  toggleDefault,
  toggleBrand,
  unlinkBrand,
  relinkBrand,
}: BrandMatrixProps) {
  const { t } = useTranslation()
  const editable = flag.flagType !== 'BOOLEAN'
  const envs = ordered(flag, environments)

  if (envs.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {t('project-detail.no-environments')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <LinkLegend />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {envs.map((env) => (
          <section
            key={env.id}
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
                flagType={flag.flagType}
                enabled={env.enabled}
                value={env.defaultValue}
                busy={isBusy(defaultRowKey(flag.id, env.environmentId))}
                onToggle={(next) => toggleDefault(flag, env, next)}
                onEdit={editable ? () => onEdit({ flag, env }) : undefined}
              />
              {env.brandValues?.map((brand) => (
                <FlagValueRow
                  key={brand.brandId}
                  label={brand.brandName}
                  name={`${env.environmentName} ${brand.brandName}`}
                  flagType={flag.flagType}
                  enabled={brand.enabled}
                  value={brand.defaultValue}
                  linked={brand.inherited ?? false}
                  onLinkChange={(link) =>
                    link
                      ? relinkBrand(flag, env, brand)
                      : unlinkBrand(flag, env, brand)
                  }
                  busy={isBusy(
                    brandRowKey(flag.id, env.environmentId, brand.brandId)
                  )}
                  onToggle={(next) => toggleBrand(flag, env, brand, next)}
                  onEdit={
                    editable ? () => onEdit({ flag, env, brand }) : undefined
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
