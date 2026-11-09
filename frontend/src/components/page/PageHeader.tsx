import { ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: ReactNode
  /** Router path; the last item (current page) usually has none. */
  to?: string
}

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  /** Buttons on the right (primary action last). */
  actions?: ReactNode
  /** Badges next to the title (type, status …). */
  meta?: ReactNode
  className?: string
}

/** Page head with breadcrumb, the page's single `<h1>`, description and actions. */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation()

  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label={t('page.breadcrumb')}>
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumb.map((item, index) => {
                const last = index === breadcrumb.length - 1
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb order is static
                  <Fragment key={index}>
                    <li className="min-w-0">
                      {item.to && !last ? (
                        <Link
                          to={item.to}
                          className="truncate rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <span
                          className="truncate"
                          aria-current={last ? 'page' : undefined}
                        >
                          {item.label}
                        </span>
                      )}
                    </li>
                    {!last && (
                      <li aria-hidden="true">
                        <ChevronRight className="h-3 w-3" />
                      </li>
                    )}
                  </Fragment>
                )
              })}
            </ol>
          </nav>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight">
            {title}
          </h1>
          {meta}
        </div>
        {description && (
          <p className="max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  )
}
