import { FlagIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Centered card layout for pages outside the app shell (login, setup, invites). */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="fixed right-4 top-4 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm">
              <FlagIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold tracking-tight text-foreground">{t('common.app-name')}</span>
          </div>
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}

/** Inline error box used by the auth pages. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  )
}
