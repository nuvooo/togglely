import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExperimentVariant } from './api'

const TONES = ['bg-primary', 'bg-primary/70', 'bg-primary/45', 'bg-primary/25']

/** Token-only fill of a variant: the control is neutral, other variants are primary shades. */
export function variantTone(variants: { key: string; isControl: boolean }[], key: string) {
  const variant = variants.find((v) => v.key === key)
  if (variant?.isControl) return 'bg-muted-foreground/60'
  const index = variants.filter((v) => !v.isControl).findIndex((v) => v.key === key)
  return TONES[Math.max(index, 0) % TONES.length]
}

export function VariantSwatch({ tone }: { tone: string }) {
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-sm', tone)} aria-hidden="true" />
}

/** Traffic split as one stacked bar plus the variants table. */
export function VariantsPanel({ variants, trafficPercent }: { variants: ExperimentVariant[]; trafficPercent: number }) {
  const { t } = useTranslation()

  if (variants.length === 0) {
    return <EmptyState title={t('experiments-page.variants.empty')} />
  }

  const total = variants.reduce((sum, v) => sum + v.weight, 0)

  const columns: DataTableColumn<ExperimentVariant>[] = [
    {
      key: 'name',
      header: t('experiments-page.variants.col-name'),
      cell: (v) => (
        <span className="flex items-center gap-2">
          <VariantSwatch tone={variantTone(variants, v.key)} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{v.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{v.key}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: t('experiments-page.variants.col-role'),
      cell: (v) =>
        v.isControl ? (
          <Badge variant="neutral">{t('experiments-page.variants.control')}</Badge>
        ) : (
          <Badge variant="outline">{t('experiments-page.variants.treatment')}</Badge>
        ),
    },
    {
      key: 'value',
      header: t('experiments-page.variants.col-value'),
      hideBelow: 'sm',
      className: 'max-w-[16rem]',
      cell: (v) => (
        <code className="block truncate font-mono text-xs" title={v.value}>
          {v.value === '' ? '""' : v.value}
        </code>
      ),
    },
    {
      key: 'weight',
      header: t('experiments-page.variants.col-weight'),
      align: 'right',
      className: 'tabular-nums',
      cell: (v) => `${v.weight} %`,
    },
  ]

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{t('experiments-page.variants.split')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('experiments-page.variants.traffic', { percent: trafficPercent })}
          </p>
        </div>
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={variants.map((v) => `${v.name} ${v.weight} %`).join(', ')}
        >
          {variants.map((v) => (
            <div
              key={v.key}
              className={cn('h-full border-r border-background last:border-r-0', variantTone(variants, v.key))}
              style={{ width: `${total > 0 ? (v.weight / total) * 100 : 0}%` }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {variants.map((v) => (
            <li key={v.key} className="flex items-center gap-1.5">
              <VariantSwatch tone={variantTone(variants, v.key)} />
              {v.name} <span className="tabular-nums">{v.weight} %</span>
            </li>
          ))}
        </ul>
      </section>

      <DataTable columns={columns} rows={variants} getRowId={(v) => v.id} label={t('experiments-page.tabs.variants')} />
    </div>
  )
}
