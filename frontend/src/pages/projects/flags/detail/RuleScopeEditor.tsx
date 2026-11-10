import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import type { RuleScope } from '@/lib/targeting-rules'
import { fieldClass } from './RuleConditionsEditor'

export interface ScopeOption {
  id: string
  name: string
}

export const EMPTY_SCOPE: RuleScope = {
  environmentIds: [],
  environmentsExcluded: false,
  brandIds: [],
  brandsExcluded: false,
}

interface ScopeListProps {
  kind: 'environments' | 'brands'
  options: ScopeOption[]
  ids: string[]
  excluded: boolean
  onChange: (ids: string[], excluded: boolean) => void
}

/** "Environments is one of / is none of [x] [y]"; nothing checked = all. */
function ScopeList({ kind, options, ids, excluded, onChange }: ScopeListProps) {
  const { t } = useTranslation()
  const legend =
    kind === 'environments'
      ? t('flag-detail.targeting.scope-environments')
      : t('flag-detail.targeting.scope-brands')
  const toggle = (id: string, checked: boolean) =>
    onChange(
      checked ? [...ids, id] : ids.filter((existing) => existing !== id),
      excluded
    )

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">
        {legend}
      </legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select
          aria-label={
            kind === 'environments'
              ? t('flag-detail.targeting.scope-environment-mode')
              : t('flag-detail.targeting.scope-brand-mode')
          }
          value={excluded ? 'none' : 'one'}
          onChange={(e) => onChange(ids, e.target.value === 'none')}
          className={`${fieldClass} w-auto`}
        >
          <option value="one">{t('flag-detail.targeting.scope-one-of')}</option>
          <option value="none">
            {t('flag-detail.targeting.scope-none-of')}
          </option>
        </select>
        {options.map((option) => {
          const id = `rule-scope-${kind}-${option.id}`
          return (
            <span key={option.id} className="inline-flex items-center gap-2">
              <Checkbox
                id={id}
                checked={ids.includes(option.id)}
                onCheckedChange={(checked) =>
                  toggle(option.id, checked === true)
                }
              />
              <label htmlFor={id} className="text-sm">
                {option.name}
              </label>
            </span>
          )
        })}
      </div>
      {ids.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {kind === 'environments'
            ? t('flag-detail.targeting.scope-all-environments-hint')
            : t('flag-detail.targeting.scope-all-brands-hint')}
        </p>
      )}
    </fieldset>
  )
}

interface RuleScopeEditorProps {
  environments: ScopeOption[]
  /** Empty for projects without brands: the brand row is hidden. */
  brands: ScopeOption[]
  scope: RuleScope
  onChange: (scope: RuleScope) => void
}

/**
 * Where a rule applies: environments and (MULTI) brands, each "one of" or
 * "none of" the checked entries. Combined with AND and with the conditions.
 */
export function RuleScopeEditor({
  environments,
  brands,
  scope,
  onChange,
}: RuleScopeEditorProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <span className="block text-sm font-medium">
        {t('flag-detail.targeting.scope-title')}
      </span>
      <ScopeList
        kind="environments"
        options={environments}
        ids={scope.environmentIds}
        excluded={scope.environmentsExcluded}
        onChange={(environmentIds, environmentsExcluded) =>
          onChange({ ...scope, environmentIds, environmentsExcluded })
        }
      />
      {brands.length > 0 && (
        <ScopeList
          kind="brands"
          options={brands}
          ids={scope.brandIds}
          excluded={scope.brandsExcluded}
          onChange={(brandIds, brandsExcluded) =>
            onChange({ ...scope, brandIds, brandsExcluded })
          }
        />
      )}
    </div>
  )
}
