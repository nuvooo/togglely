import { Link2, Link2Off, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { FlagType } from './FlagValueDialog'

interface FlagValueRowProps {
  /** Row label: "Default (all brands)", a brand or an environment name. */
  label: ReactNode
  /** Accessible name for the switch / edit / link button. */
  name: string
  flagType: FlagType
  enabled: boolean
  /** Effective value (the default's for linked brands). */
  value: string
  /**
   * Brand rows only: true = follows the default (no own row), false = own
   * value. Omitted for default / environment rows (no link toggle).
   */
  linked?: boolean
  /** Link toggle: false = create an own value, true = follow the default. */
  onLinkChange?: (linked: boolean) => void
  busy?: boolean
  /** Visual emphasis for the default row. */
  primary?: boolean
  onToggle: (enabled: boolean) => void
  /** Non-boolean flags only: opens the value editor. */
  onEdit?: () => void
  /** No write permission: switch, link toggle and edit are disabled ("Read only"). */
  readOnly?: boolean
}

/** Muted legend line explaining the link icon ("🔗 = follows default"). */
export function LinkLegend() {
  const { t } = useTranslation()
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link2 className="h-3.5 w-3.5" aria-hidden />
      <span>= {t('brand-values.legend')}</span>
    </p>
  )
}

/**
 * One value row (default, brand or environment): switch for `enabled`, the
 * current value with an edit action for non-boolean flags and, for brands,
 * a link toggle (follow the default / own value).
 */
export function FlagValueRow({
  label,
  name,
  flagType,
  enabled,
  value,
  linked,
  onLinkChange,
  busy = false,
  primary = false,
  onToggle,
  onEdit,
  readOnly = false,
}: FlagValueRowProps) {
  const { t } = useTranslation()
  const locked = busy || readOnly
  const readOnlyTitle = readOnly ? t('common.read-only') : undefined
  const showValue = flagType !== 'BOOLEAN'
  const isLinked = linked === true
  const linkLabel = isLinked
    ? t('brand-values.linked-label', { name })
    : t('brand-values.unlinked-label', { name })
  const LinkIcon = isLinked ? Link2 : Link2Off

  return (
    <div
      data-testid="flag-value-row"
      data-linked={linked === undefined ? undefined : String(isLinked)}
      className={cn(
        'rounded-md border border-border p-2',
        primary ? 'bg-card' : 'bg-background'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'min-w-0 truncate text-sm',
            primary && 'font-semibold',
            isLinked ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {linked !== undefined && onLinkChange && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onLinkChange(!isLinked)}
                    disabled={locked}
                    aria-pressed={isLinked}
                    aria-label={linkLabel}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      isLinked ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <LinkIcon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{linkLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span title={readOnlyTitle} className="inline-flex">
            <Switch
              checked={enabled}
              disabled={locked}
              onCheckedChange={onToggle}
              aria-label={t('brand-values.toggle-label', { name })}
              className={cn(isLinked && 'opacity-60')}
            />
          </span>
        </div>
      </div>
      {showValue && (
        <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {t('flag-value.value')}:
          </span>
          <code
            className={cn(
              'min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono',
              isLinked ? 'text-muted-foreground' : 'text-foreground'
            )}
            title={value}
          >
            {value === '' ? '""' : value}
          </code>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={locked}
              title={readOnlyTitle}
              aria-label={t('flag-value.edit-label', { name })}
              className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              {t('flag-value.edit')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
