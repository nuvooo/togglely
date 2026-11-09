import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/errors'

export type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

/** Pretty-prints JSON for editing; leaves anything unparseable as is. */
function toEditable(flagType: FlagType, value: string): string {
  if (flagType !== 'JSON') return value
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/**
 * Validates and normalizes an edited value. Returns the value to send or an
 * error key. JSON is sent compact, numbers trimmed.
 */
export function normalizeFlagValue(
  flagType: FlagType,
  raw: string
):
  | { ok: true; value: string }
  | { ok: false; error: string; params?: Record<string, string> } {
  if (flagType === 'NUMBER') {
    const trimmed = raw.trim()
    if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
      return { ok: false, error: 'flag-value.invalid-number' }
    }
    return { ok: true, value: trimmed }
  }
  if (flagType === 'JSON') {
    try {
      return { ok: true, value: JSON.stringify(JSON.parse(raw)) }
    } catch (error) {
      return {
        ok: false,
        error: 'flag-value.invalid-json',
        params: { message: error instanceof Error ? error.message : '' },
      }
    }
  }
  if (flagType === 'BOOLEAN') {
    return raw === 'true' || raw === 'false'
      ? { ok: true, value: raw }
      : { ok: false, error: 'flag-value.invalid-boolean' }
  }
  return { ok: true, value: raw }
}

interface FlagValueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flagType: FlagType
  /** Flag name, shown in the description. */
  flagName: string
  environmentName: string
  /** "Default (all brands)" or the brand name; omitted for single projects. */
  targetName?: string
  initialValue: string
  /** Extra hint below the field, e.g. "saving creates an override". */
  hint?: string
  /** Persists the normalized value; rejects → toast, dialog stays open. */
  onSave: (value: string) => Promise<void>
}

/** Type-aware editor for a flag value (STRING / NUMBER / JSON). */
export function FlagValueDialog({
  open,
  onOpenChange,
  flagType,
  flagName,
  environmentName,
  targetName,
  initialValue,
  hint,
  onSave,
}: FlagValueDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(toEditable(flagType, initialValue))
      setError(null)
    }
  }, [open, flagType, initialValue])

  const handleSave = async () => {
    const result = normalizeFlagValue(flagType, value)
    if (!result.ok) {
      setError(t(result.error, result.params))
      return
    }
    setSaving(true)
    try {
      await onSave(result.value)
      onOpenChange(false)
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('flag-value.title')}</DialogTitle>
          <DialogDescription>
            {targetName
              ? t('flag-value.description-target', {
                  flag: flagName,
                  target: targetName,
                  environment: environmentName,
                })
              : t('flag-value.description', {
                  flag: flagName,
                  environment: environmentName,
                })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <Label htmlFor="flag-value-input">
            {t('flag-value.label', { type: flagType })}
          </Label>
          {flagType === 'JSON' ? (
            <textarea
              id="flag-value-input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              className={`${fieldClass} min-h-[160px]`}
              placeholder='{"enabled": true}'
              aria-invalid={!!error}
            />
          ) : flagType === 'BOOLEAN' ? (
            <select
              id="flag-value-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={fieldClass}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <Input
              id="flag-value-input"
              type={flagType === 'NUMBER' ? 'number' : 'text'}
              inputMode={flagType === 'NUMBER' ? 'decimal' : undefined}
              step={flagType === 'NUMBER' ? 'any' : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              aria-invalid={!!error}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {hint && !error && (
            <p className="text-xs text-muted-foreground">{hint}</p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('flag-value.saving') : t('flag-value.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
