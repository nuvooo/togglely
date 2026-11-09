import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { flagPath } from '@/lib/routes'
import type { Experiment } from './api'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  )
}

export function OverviewPanel({ experiment, projectId }: { experiment: Experiment; projectId: string }) {
  const { t, i18n } = useTranslation()
  const date = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '–'
  const creator = experiment.createdBy
  const creatorName = creator
    ? [creator.firstName, creator.lastName].filter(Boolean).join(' ') || creator.email || '–'
    : '–'

  return (
    <div className="space-y-4">
      {(experiment.description || experiment.hypothesis) && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          {experiment.description && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium">{t('experiments-page.overview.description')}</h2>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{experiment.description}</p>
            </div>
          )}
          {experiment.hypothesis && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium">{t('experiments-page.overview.hypothesis')}</h2>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{experiment.hypothesis}</p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="sr-only">{t('experiments-page.overview.details')}</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('experiments-page.overview.key')}>
            <code className="font-mono text-xs">{experiment.key}</code>
          </Field>
          <Field label={t('experiments-page.overview.flag')}>
            {experiment.flag ? (
              <Link to={flagPath(projectId, experiment.flag.id)} className="hover:underline">
                {experiment.flag.name}{' '}
                <span className="font-mono text-xs text-muted-foreground">{experiment.flag.key}</span>
              </Link>
            ) : (
              '–'
            )}
          </Field>
          <Field label={t('experiments-page.overview.environment')}>
            {experiment.environment ? <Badge variant="outline">{experiment.environment.name}</Badge> : '–'}
          </Field>
          <Field label={t('experiments-page.overview.traffic')}>
            <span className="tabular-nums">{experiment.trafficPercent} %</span>
          </Field>
          <Field label={t('experiments-page.overview.variants')}>
            <span className="tabular-nums">{experiment.variants.length}</span>
          </Field>
          <Field label={t('experiments-page.overview.created-by')}>{creatorName}</Field>
          <Field label={t('experiments-page.overview.created')}>{date(experiment.createdAt)}</Field>
          <Field label={t('experiments-page.overview.started')}>{date(experiment.startedAt)}</Field>
          <Field label={t('experiments-page.overview.ended')}>{date(experiment.endedAt)}</Field>
        </dl>
      </section>
    </div>
  )
}
