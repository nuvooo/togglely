import type { ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Red frame for destructive settings ("Danger zone"). */
  danger?: boolean
  className?: string
}

/** Settings pattern: title and description on the left, the form on the right. */
export function SettingsSection({
  title,
  description,
  children,
  danger = false,
  className,
}: SettingsSectionProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8',
        danger && 'rounded-lg border border-destructive/50 p-4 sm:p-6',
        className
      )}
    >
      <div className="space-y-1">
        <h2
          id={headingId}
          className={cn('text-sm font-semibold', danger && 'text-destructive')}
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
