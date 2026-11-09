import { Link2, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LinkLegend } from '@/components/flags/FlagValueRow'
import { Badge } from '@/components/ui/badge'
import { brandPath } from '@/lib/routes'
import type { BrandEnvironment, BrandValue, FlagType } from './types'

interface BrandRow {
  brandId: string
  brandName: string
  /** environmentId → value of this brand */
  values: Map<string, BrandValue>
}

/** Pivots environment → brands into brand → environments (first-seen order). */
export function toBrandRows(environments: BrandEnvironment[]): BrandRow[] {
  const rows = new Map<string, BrandRow>()
  for (const env of environments) {
    for (const brand of env.brands) {
      let row = rows.get(brand.brandId)
      if (!row) {
        row = {
          brandId: brand.brandId,
          brandName: brand.brandName,
          values: new Map(),
        }
        rows.set(brand.brandId, row)
      }
      row.values.set(env.environmentId, brand)
    }
  }
  return Array.from(rows.values())
}

interface FlagBrandsTabProps {
  projectId: string
  flagType: FlagType
  brandEnvironments: BrandEnvironment[] | null
  brandError: string | null
  onRetry: () => void
}

/** MULTI only: read-only brand × environment overview of the flag. */
export function FlagBrandsTab({
  projectId,
  flagType,
  brandEnvironments,
  brandError,
  onRetry,
}: FlagBrandsTabProps) {
  const { t } = useTranslation()

  if (brandError) {
    return (
      <ErrorState
        title={t('flag-detail.brands.load-error')}
        message={brandError}
        onRetry={onRetry}
      />
    )
  }

  const environments = brandEnvironments ?? []
  const rows = toBrandRows(environments)

  const columns: DataTableColumn<BrandRow>[] = [
    {
      key: 'brand',
      header: t('flag-detail.brands.brand'),
      width: '12rem',
      cell: (row) => (
        <Link
          to={brandPath(projectId, row.brandId)}
          className="font-medium hover:underline"
        >
          {row.brandName}
        </Link>
      ),
    },
    ...environments.map(
      (env): DataTableColumn<BrandRow> => ({
        key: env.environmentId,
        header: env.environmentName,
        cell: (row) => {
          const value = row.values.get(env.environmentId)
          if (!value) return <span className="text-muted-foreground">—</span>
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <Badge variant={value.enabled ? 'success' : 'neutral'}>
                {value.enabled
                  ? t('brand-values.state-on')
                  : t('brand-values.state-off')}
              </Badge>
              {flagType !== 'BOOLEAN' && (
                <code
                  className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                  title={value.value}
                >
                  {value.value === '' ? '""' : value.value}
                </code>
              )}
              {value.inherited && (
                <Link2
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label={t('brand-values.legend')}
                  role="img"
                />
              )}
            </span>
          )
        },
      })
    ),
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {t('flag-detail.brands.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('flag-detail.brands.description')}
        </p>
      </div>
      <LinkLegend />
      <DataTable
        label={t('flag-detail.brands.title')}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.brandId}
        loading={!brandEnvironments}
        loadingRows={3}
        empty={
          <EmptyState
            bordered={false}
            icon={<Store className="h-5 w-5" />}
            title={t('flag-detail.brands.empty-title')}
            description={t('flag-detail.brands.empty-description')}
          />
        }
      />
    </div>
  )
}
