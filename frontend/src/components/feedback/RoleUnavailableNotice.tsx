import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { refreshWorkspace } from '@/lib/workspace'

/**
 * Small notice for pages that gate writes on the user's role when the
 * workspace (and thus the role) failed to load: explains why editing is
 * unavailable instead of silently showing a read-only page.
 */
export function RoleUnavailableNotice({ show }: { show: boolean }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {t('permissions.role-unavailable')}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => {
          refreshWorkspace().catch(() => {})
        }}
      >
        {t('permissions.retry')}
      </Button>
    </div>
  )
}
