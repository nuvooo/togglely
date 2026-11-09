import { useTranslation } from 'react-i18next'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import type { ExperimentStatus } from './api'

const VARIANT: Record<ExperimentStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  RUNNING: 'success',
  PAUSED: 'warning',
  COMPLETED: 'outline',
  ARCHIVED: 'neutral',
}

export function ExperimentStatusBadge({ status, className }: { status: ExperimentStatus; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant={VARIANT[status] ?? 'neutral'} className={className}>
      {status === 'RUNNING' && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />}
      {t(`experiments-page.status.${status.toLowerCase()}`)}
    </Badge>
  )
}
