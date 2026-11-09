import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** lucide icon element, e.g. `<Flag className="h-5 w-5" />` */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Button(s) or a hint below the text. */
  action?: ReactNode
  /** Dashed frame (default); turn off inside an already framed container like a table. */
  bordered?: boolean
  className?: string
}

/** Message for "nothing here yet" (and other informational states like "no access"). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  bordered = true,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center',
        bordered && 'rounded-lg border border-dashed',
        className
      )}
    >
      {icon && (
        <span
          className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <p className={cn('font-medium', icon && 'mt-3')}>{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
