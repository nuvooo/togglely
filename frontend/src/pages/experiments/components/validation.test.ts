import { describe, expect, it } from 'vitest'
import { lifecycleActions } from './api'
import { type ExperimentDraft, toKey, validateDraft } from './validation'

const draft = (overrides: Partial<ExperimentDraft> = {}): ExperimentDraft => ({
  name: 'Test',
  key: 'test',
  description: '',
  hypothesis: '',
  flagId: 'f1',
  environmentId: 'e1',
  trafficPercent: '100',
  variants: [
    { uid: 'a', key: 'control', name: 'Control', value: 'a', weight: '50', isControl: true },
    { uid: 'b', key: 'b', name: 'B', value: 'b', weight: '50', isControl: false },
  ],
  ...overrides,
})

describe('validateDraft', () => {
  it('accepts a valid draft', () => {
    expect(validateDraft(draft())).toEqual({})
  })

  it('checks the general fields', () => {
    const errors = validateDraft(draft({ name: ' ', key: 'has space', flagId: '', environmentId: '', trafficPercent: '0' }))
    expect(errors.name.code).toBe('required')
    expect(errors.key.code).toBe('key-format')
    expect(errors.flagId.code).toBe('flag-required')
    expect(errors.environmentId.code).toBe('environment-required')
    expect(errors.trafficPercent.code).toBe('traffic-range')
  })

  it('checks the variants', () => {
    const base = draft()
    expect(validateDraft(draft({ variants: base.variants.slice(0, 1) })).variants.code).toBe('variants-min')
    expect(
      validateDraft(draft({ variants: base.variants.map((v) => ({ ...v, isControl: true })) })).variants.code
    ).toBe('control-one')
    const uneven = validateDraft(draft({ variants: [base.variants[0], { ...base.variants[1], weight: '40' }] }))
    expect(uneven.variants).toEqual({ code: 'weights-sum', params: { total: 90 } })
    const dup = validateDraft(draft({ variants: [base.variants[0], { ...base.variants[1], key: 'control' }] }))
    expect(dup['variant-1-key'].code).toBe('key-duplicate')
  })

  it('checks values against the flag type', () => {
    expect(validateDraft(draft(), 'BOOLEAN')['variant-0-value'].code).toBe('value-boolean')
    expect(validateDraft(draft(), 'NUMBER')['variant-0-value'].code).toBe('value-number')
    expect(validateDraft(draft(), 'JSON')['variant-0-value'].code).toBe('value-json')
    expect(validateDraft(draft(), 'STRING')).toEqual({})
  })
})

describe('helpers', () => {
  it('derives keys from names', () => {
    expect(toKey('Über Café CTA!')).toBe('uber-cafe-cta')
  })

  it('maps statuses to the allowed lifecycle actions', () => {
    expect(lifecycleActions('DRAFT')).toEqual(['start'])
    expect(lifecycleActions('RUNNING')).toEqual(['pause', 'complete'])
    expect(lifecycleActions('PAUSED')).toEqual(['start', 'complete'])
    expect(lifecycleActions('COMPLETED')).toEqual([])
  })
})
