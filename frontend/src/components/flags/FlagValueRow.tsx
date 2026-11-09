import { Pencil, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { FlagType } from './FlagValueDialog'

interface FlagValueRowProps {
  /** Row label: "Default (all brands)", a brand or an environment name. */
  label: ReactNode
  /** Accessible name for the switch / edit button. */
  name: string
  flagType: FlagType
  enabled: boolean
  /** Effective value (the default's for inherited brands). */
  value: string
  /** Brand without own row: shows the "inherits default" label. */
  inherited?: boolean
  /** Brand with own row: shows the reset button. */
  overridden?: boolean
  busy?: boolean
  /** Visual emphasis for the default row. */
  primary?: boolean
  onToggle: (enabled: boolean) => void
  /** Non-boolean flags only: opens the value editor. */
  onEdit?: () => void
  onReset?: () => void
}

/**
 * One value row (default, brand or environment): switch for `enabled`, the
 * current value with an edit action for non-boolean flags, and the
 * inheritance state for brands.
 */
export function FlagValueRow({
  label,
  name,
  flagType,
  enabled,
  value,
  inherited = false,
  overridden = false,
  busy = false,
  primary = false,
  onToggle,
  onEdit,
  onReset,
}: FlagValueRowProps) {
  const { t } = useTranslation()
  const showValue = flagType !== 'BOOLEAN'

  return (
    <div
      data-testid="flag-value-row"
      className={cn(
        'rounded-md border border-border p-2',
        primary ? 'bg-card' : 'bg-background'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              'truncate text-sm',
              primary ? 'font-semibold text-foreground' : 'text-foreground'
            )}
          >
            {label}
          </span>
          {inherited && (
            <span className="text-xs italic text-muted-foreground">
              {t('brand-values.inherits-default')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {overridden && onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              title={t('brand-values.reset-title')}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {t('brand-values.reset')}
            </button>
          )}
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={onToggle}
            aria-label={t('brand-values.toggle-label', { name })}
          />
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
              inherited ? 'text-muted-foreground' : 'text-foreground'
            )}
            title={value}
          >
            {value === '' ? '""' : value}
          </code>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
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
