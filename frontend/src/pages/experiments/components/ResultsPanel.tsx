import { BarChart3, CheckCircle2, Info, RefreshCw, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ExperimentResults, ExperimentStatus, VariantResult } from './api'
import { VariantSwatch, variantTone } from './VariantsPanel'

/** Minimum exposures per variant before the backend tests for significance. */
export const MIN_SAMPLE = 30

interface Props {
  status: ExperimentStatus
  results: ExperimentResults | null
  loading: boolean
  error: boolean
  refreshing?: boolean
  onRetry: () => void
  onRefresh: () => void
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

export function ResultsPanel({ status, results, loading, error, refreshing = false, onRetry, onRefresh }: Props) {
  const { t, i18n } = useTranslation()
  const number = (n: number) => n.toLocaleString(i18n.language)
  const percent = (ratio: number, digits = 2) =>
    `${(ratio * 100).toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`

  if (loading) {
    return (
      <div role="status" aria-label={t('common.loading')} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (error) {
    return <ErrorState message={t('experiments-page.results.load-error')} onRetry={onRetry} />
  }
  if (!results || results.totalImpressions === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title={t('experiments-page.results.empty-title')}
        description={
          status === 'DRAFT' ? t('experiments-page.results.empty-draft') : t('experiments-page.results.empty-waiting')
        }
        action={
          status !== 'DRAFT' ? (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {t('experiments-page.results.refresh')}
            </Button>
          ) : undefined
        }
      />
    )
  }

  const variants = results.variants
  const control = variants.find((v) => v.isControl)
  const maxRate = Math.max(...variants.map((v) => v.conversionRate), 0)
  const winner = variants.find((v) => v.key === results.winner)
  const tooSmall = variants.some((v) => v.impressions < MIN_SAMPLE)

  const lift = (v: VariantResult) => {
    if (!control || v.isControl || control.conversionRate === 0) return null
    return (v.conversionRate - control.conversionRate) / control.conversionRate
  }

  const columns: DataTableColumn<VariantResult>[] = [
    {
      key: 'variant',
      header: t('experiments-page.results.col-variant'),
      className: 'max-w-[14rem]',
      cell: (v) => (
        <span className="flex flex-wrap items-center gap-2">
          <VariantSwatch tone={results.winner === v.key ? 'bg-success' : variantTone(variants, v.key)} />
          <span className="truncate font-medium">{v.name}</span>
          {v.isControl && <Badge variant="neutral">{t('experiments-page.variants.control')}</Badge>}
          {results.winner === v.key && (
            <Badge variant="success">
              <Trophy className="h-3 w-3" aria-hidden="true" />
              {t('experiments-page.results.winner')}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'impressions',
      header: t('experiments-page.results.col-impressions'),
      align: 'right',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (v) => number(v.impressions),
    },
    {
      key: 'conversions',
      header: t('experiments-page.results.col-conversions'),
      align: 'right',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (v) => number(v.conversions),
    },
    {
      key: 'rate',
      header: t('experiments-page.results.col-rate'),
      align: 'right',
      className: 'tabular-nums font-medium',
      cell: (v) => percent(v.conversionRate),
    },
    {
      key: 'lift',
      header: t('experiments-page.results.col-lift'),
      align: 'right',
      hideBelow: 'md',
      className: 'tabular-nums',
      cell: (v) => {
        const value = lift(v)
        if (value === null) return <span className="text-muted-foreground">–</span>
        return (
          <span className={cn(value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {value > 0 ? '+' : ''}
            {percent(value, 1)}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-3.5 w-3.5', refreshing && 'animate-spin')} />
          {t('experiments-page.results.refresh')}
        </Button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('experiments-page.results.impressions')} value={number(results.totalImpressions)} />
        <Stat label={t('experiments-page.results.conversions')} value={number(results.totalConversions)} />
        <Stat
          label={t('experiments-page.results.confidence')}
          value={results.confidence > 0 ? percent(results.confidence, 1) : '–'}
          hint={t('experiments-page.results.confidence-hint')}
        />
      </dl>

      <div
        role="note"
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3 text-sm',
          results.isSignificant ? 'border-success/40 bg-success/10' : 'bg-muted/40'
        )}
      >
        {results.isSignificant ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="space-y-0.5">
          <p className="font-medium">
            {results.isSignificant
              ? t('experiments-page.results.significant', {
                  name: winner?.name ?? results.winner ?? '',
                  confidence: percent(results.confidence, 1),
                })
              : t('experiments-page.results.not-significant')}
          </p>
          <p className="text-muted-foreground">
            {!control
              ? t('experiments-page.results.no-control')
              : tooSmall
                ? t('experiments-page.results.sample-hint', { min: MIN_SAMPLE })
                : t('experiments-page.results.method-hint')}
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">{t('experiments-page.results.chart-title')}</h2>
        <ul className="space-y-3">
          {variants.map((v) => (
            <li key={v.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
              <span className="truncate" title={v.name}>
                {v.name}
              </span>
              {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot be styled with the design tokens */}
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label={v.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number((v.conversionRate * 100).toFixed(2))}
                aria-valuetext={percent(v.conversionRate)}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width]',
                    results.winner === v.key ? 'bg-success' : variantTone(variants, v.key)
                  )}
                  style={{ width: `${maxRate > 0 ? (v.conversionRate / maxRate) * 100 : 0}%` }}
                />
              </div>
              <span className="w-20 text-right tabular-nums">{percent(v.conversionRate)}</span>
            </li>
          ))}
        </ul>
      </section>

      <DataTable
        columns={columns}
        rows={variants}
        getRowId={(v) => v.key}
        label={t('experiments-page.tabs.results')}
      />
    </div>
  )
}
