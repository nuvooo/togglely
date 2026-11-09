import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatRelative } from '../flagsFilter'
import type { FlagDetail } from './types'

/** Muted metadata line of the flag header: created, updated and the flag id (copyable). */
export function FlagMeta({
  flag,
  onCopyId,
}: {
  flag: FlagDetail
  onCopyId: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const time = (iso: string | undefined, label: string, relative = false) => {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    const text = relative
      ? formatRelative(iso, locale)
      : date.toLocaleDateString(locale, { dateStyle: 'medium' })
    return (
      <span>
        {label}{' '}
        <time dateTime={iso} title={date.toLocaleString(locale)}>
          {text}
        </time>
      </span>
    )
  }

  return (
    <span
      data-testid="flag-meta"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {time(flag.createdAt, t('flag-detail.meta.created'))}
      {time(flag.updatedAt, t('flag-detail.meta.updated'), true)}
      <span className="inline-flex min-w-0 items-center gap-1">
        {t('flag-detail.meta.id')}{' '}
        <code className="min-w-0 truncate font-mono">{flag.id}</code>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onCopyId}
          aria-label={t('flag-detail.meta.copy-id')}
          title={t('flag-detail.meta.copy-id')}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </span>
    </span>
  )
}
