import { AlertCircle, FlagIcon, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

/**
 * Page frame outside the app shell (sign-in, setup, invites, password and
 * e-mail flows): logo, centered content and a footer with language and theme.
 * `footer` is rendered below the card (e.g. a secondary link).
 */
export function AuthLayout({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg bg-primary"
              aria-hidden="true"
            >
              <FlagIcon className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              {t('common.app-name')}
            </span>
          </div>
          {children}
          {footer && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </main>
      <footer className="flex items-center justify-center gap-1 pb-6">
        <LanguageSwitcher />
        <ThemeToggle />
      </footer>
    </div>
  )
}

interface AuthCardProps {
  /** The page's single `<h1>`. */
  title?: ReactNode
  description?: ReactNode
  /** Icon above the title (status pages). */
  icon?: ReactNode
  children?: ReactNode
  /** Centers the header and body (status pages without a form). */
  centered?: boolean
  className?: string
}

/** Card used by every auth page: same paddings, title and description styles. */
export function AuthCard({
  title,
  description,
  icon,
  children,
  centered = false,
  className,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-6 text-card-foreground',
        centered && 'text-center',
        className
      )}
    >
      {(title || icon) && (
        <div
          className={cn(
            'mb-5 space-y-1.5',
            centered && 'flex flex-col items-center'
          )}
        >
          {icon && (
            <span
              className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          {title && (
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

/** Secondary text link on auth pages (inherits the muted text color). */
export const AUTH_LINK_CLASS =
  'rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Inline error alert used by the auth pages. */
export function FormError({
  children,
  className,
  id,
}: {
  children: ReactNode
  className?: string
  /** Referenced by the fields via `aria-describedby` (see `fieldErrorProps`). */
  id?: string
}) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Spinner shown while an auth page loads its data. */
export function AuthLoading() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('common.loading')}
      className="flex justify-center py-12"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Accessibility props of a form field: while the form shows an error
 * (`FormError` with `errorId`) the field is invalid and described by it,
 * after its own hints (`describedBy`).
 */
export function fieldErrorProps(
  errorId: string,
  hasError: boolean,
  ...describedBy: (string | undefined)[]
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const ids = [...describedBy, hasError ? errorId : undefined].filter(Boolean)
  return {
    ...(hasError ? { 'aria-invalid': true as const } : {}),
    ...(ids.length ? { 'aria-describedby': ids.join(' ') } : {}),
  }
}
