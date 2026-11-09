import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { ProjectEnvironment } from '@/lib/webhooks'

interface EnvironmentSelectProps {
  environments: ProjectEnvironment[]
  /** Selected environment ids; empty = all environments */
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

/** Multi-select of environments with an "all environments" default. */
export function EnvironmentSelect({ environments, value, onChange, disabled }: EnvironmentSelectProps) {
  const { t } = useTranslation()
  const all = value.length === 0

  const toggle = (id: string, checked: boolean) => {
    // Unchecking the last environment falls back to "all" (empty list).
    onChange(checked ? [...value, id] : value.filter((v) => v !== id))
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium leading-none">{t('webhooks.form.environments')}</legend>
      <div className="flex items-center gap-2">
        <Checkbox
          id="webhook-env-all"
          checked={all}
          onCheckedChange={(checked) => checked === true && onChange([])}
          disabled={disabled}
        />
        <Label htmlFor="webhook-env-all" className="font-normal">
          {t('webhooks.form.all-environments')}
        </Label>
      </div>
      <div className="grid gap-2 border-l pl-4 sm:grid-cols-2">
        {environments.map((env) => (
          <div key={env.id} className="flex min-w-0 items-center gap-2">
            <Checkbox
              id={`webhook-env-${env.id}`}
              checked={value.includes(env.id)}
              onCheckedChange={(checked) => toggle(env.id, checked === true)}
              disabled={disabled}
            />
            <Label htmlFor={`webhook-env-${env.id}`} className="truncate font-normal">
              {env.name}
            </Label>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('webhooks.form.environments-hint')}</p>
    </fieldset>
  )
}
