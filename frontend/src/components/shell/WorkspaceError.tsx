import { AlertCircle, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { refreshWorkspace } from '@/lib/workspace'

/** Shown when projects/orgs could not be loaded; retries via `refreshWorkspace()`. */
export function WorkspaceError({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)

  const retry = () => {
    setRetrying(true)
    // Failures surface through the workspace snapshot.
    refreshWorkspace()
      .catch(() => {})
      .finally(() => setRetrying(false))
  }

  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2', compact ? 'p-2' : 'p-4', className)}>
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('nav.load-error')}</span>
      </div>
      <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
        <RotateCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} />
        {t('common.retry')}
      </Button>
    </div>
  )
}
