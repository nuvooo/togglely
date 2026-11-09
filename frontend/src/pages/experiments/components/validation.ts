import { LIMITS } from './api'

export interface VariantDraft {
  uid: string
  key: string
  name: string
  value: string
  weight: string
  isControl: boolean
}

export interface ExperimentDraft {
  name: string
  key: string
  description: string
  hypothesis: string
  flagId: string
  environmentId: string
  trafficPercent: string
  variants: VariantDraft[]
}

/** Field → i18n error key (below `experiments-page.form.errors.`) with params. */
export type DraftErrors = Record<string, { code: string; params?: Record<string, unknown> }>

const KEY_PATTERN = /^[a-zA-Z0-9_-]+$/
/** Experiment keys: the backend stores them lower-cased, so only lower case is accepted. */
const EXPERIMENT_KEY_PATTERN = /^[a-z0-9_-]+$/
const isInt = (value: string) => /^\d+$/.test(value.trim())

/** Lower-case key from a name: "Homepage CTA" → "homepage-cta". */
export const toKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, LIMITS.key)

export const weightTotal = (variants: VariantDraft[]) =>
  variants.reduce((sum, v) => sum + (isInt(v.weight) ? Number(v.weight) : 0), 0)

function valueError(value: string, flagType: string | undefined) {
  switch (flagType) {
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'value-boolean'
    case 'NUMBER':
      return value.trim() !== '' && Number.isFinite(Number(value)) ? null : 'value-number'
    case 'JSON':
      try {
        JSON.parse(value)
        return null
      } catch {
        return 'value-json'
      }
    default:
      return null
  }
}

/** Client-side checks mirroring the backend DTO and lifecycle rules. Empty result = valid. */
export function validateDraft(draft: ExperimentDraft, flagType?: string): DraftErrors {
  const errors: DraftErrors = {}

  if (!draft.name.trim()) errors.name = { code: 'required' }
  else if (draft.name.length > LIMITS.name) errors.name = { code: 'too-long', params: { max: LIMITS.name } }

  if (!draft.key.trim()) errors.key = { code: 'required' }
  else if (draft.key.length > LIMITS.key) errors.key = { code: 'too-long', params: { max: LIMITS.key } }
  else if (!EXPERIMENT_KEY_PATTERN.test(draft.key)) errors.key = { code: 'key-format-lower' }

  if (draft.description.length > LIMITS.text)
    errors.description = { code: 'too-long', params: { max: LIMITS.text } }
  if (draft.hypothesis.length > LIMITS.text) errors.hypothesis = { code: 'too-long', params: { max: LIMITS.text } }

  if (!draft.flagId) errors.flagId = { code: 'flag-required' }
  if (!draft.environmentId) errors.environmentId = { code: 'environment-required' }

  const traffic = Number(draft.trafficPercent)
  if (!isInt(draft.trafficPercent) || traffic < 1 || traffic > 100) errors.trafficPercent = { code: 'traffic-range' }

  const { variants } = draft
  if (variants.length < 2) errors.variants = { code: 'variants-min' }
  else if (variants.length > LIMITS.variants) errors.variants = { code: 'variants-max', params: { max: LIMITS.variants } }
  else if (variants.filter((v) => v.isControl).length !== 1) errors.variants = { code: 'control-one' }
  else if (variants.every((v) => isInt(v.weight)) && weightTotal(variants) !== 100)
    errors.variants = { code: 'weights-sum', params: { total: weightTotal(variants) } }

  const seen = new Set<string>()
  variants.forEach((v, i) => {
    const key = v.key.trim()
    if (!key) errors[`variant-${i}-key`] = { code: 'required' }
    else if (!KEY_PATTERN.test(key)) errors[`variant-${i}-key`] = { code: 'key-format' }
    else if (seen.has(key)) errors[`variant-${i}-key`] = { code: 'key-duplicate' }
    seen.add(key)

    if (!v.name.trim()) errors[`variant-${i}-name`] = { code: 'required' }

    const weight = Number(v.weight)
    if (!isInt(v.weight) || weight > 100) errors[`variant-${i}-weight`] = { code: 'weight-range' }

    const valueCode = valueError(v.value, flagType)
    if (valueCode) errors[`variant-${i}-value`] = { code: valueCode }
  })

  return errors
}
