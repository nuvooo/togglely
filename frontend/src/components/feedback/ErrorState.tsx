import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  /** What failed, e.g. "The webhooks could not be loaded." */
  message: ReactNode
  /** Optional headline above the message. */
  title?: ReactNode
  /** Shows a "Try again" button. */
  onRetry?: () => void
  retryLabel?: string
  icon?: ReactNode
  className?: string
}

/** Load error with an optional retry button. Announced to screen readers. */
export function ErrorState({
  message,
  title,
  onRetry,
  retryLabel,
  icon,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        {icon ?? <AlertTriangle className="h-5 w-5" />}
      </span>
      {title && <p className="mt-3 font-medium">{title}</p>}
      <p
        className={cn(
          title
            ? 'mt-1 max-w-md text-sm text-muted-foreground'
            : 'mt-3 font-medium'
        )}
      >
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel ?? t('page.retry')}
        </Button>
      )}
    </div>
  )
}
