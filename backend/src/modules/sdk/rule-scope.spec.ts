import { ruleAppliesTo, scopedEnvironmentIds } from './rule-scope'

const DEV = 'env-dev'
const PROD = 'env-prod'
const ACME = 'brand-acme'
const GLOBEX = 'brand-globex'

describe('ruleAppliesTo', () => {
  it('applies everywhere without a scope', () => {
    expect(ruleAppliesTo({}, DEV, null)).toBe(true)
    expect(
      ruleAppliesTo(
        { environmentIds: [], brandIds: [], brandsExcluded: true },
        PROD,
        ACME
      )
    ).toBe(true)
  })

  it('limits to the listed environments', () => {
    const rule = { environmentIds: [DEV] }
    expect(ruleAppliesTo(rule, DEV, null)).toBe(true)
    expect(ruleAppliesTo(rule, PROD, null)).toBe(false)
  })

  it('excludes the listed environments', () => {
    const rule = { environmentIds: [PROD], environmentsExcluded: true }
    expect(ruleAppliesTo(rule, DEV, ACME)).toBe(true)
    expect(ruleAppliesTo(rule, PROD, ACME)).toBe(false)
  })

  it('limits to the listed brands; requests without a brand do not match', () => {
    const rule = { brandIds: [ACME] }
    expect(ruleAppliesTo(rule, DEV, ACME)).toBe(true)
    expect(ruleAppliesTo(rule, DEV, GLOBEX)).toBe(false)
    expect(ruleAppliesTo(rule, DEV, null)).toBe(false)
  })

  it('excludes the listed brands; requests without a brand match', () => {
    const rule = { brandIds: [ACME], brandsExcluded: true }
    expect(ruleAppliesTo(rule, DEV, ACME)).toBe(false)
    expect(ruleAppliesTo(rule, DEV, GLOBEX)).toBe(true)
    expect(ruleAppliesTo(rule, DEV, null)).toBe(true)
  })

  it('needs both environment and brand to match', () => {
    const rule = { environmentIds: [DEV], brandIds: [ACME, GLOBEX] }
    expect(ruleAppliesTo(rule, DEV, GLOBEX)).toBe(true)
    expect(ruleAppliesTo(rule, PROD, GLOBEX)).toBe(false)
    expect(ruleAppliesTo(rule, DEV, 'brand-other')).toBe(false)
  })
})

describe('scopedEnvironmentIds', () => {
  it('collects the listed environments of all rules', () => {
    expect(
      scopedEnvironmentIds([
        { environmentIds: [DEV] },
        { environmentIds: [DEV, PROD] },
      ])
    ).toEqual([DEV, PROD])
  })

  it('is "all" when a rule is not limited to listed environments', () => {
    expect(scopedEnvironmentIds([{ environmentIds: [DEV] }, {}])).toBe('all')
    expect(
      scopedEnvironmentIds([
        { environmentIds: [PROD], environmentsExcluded: true },
      ])
    ).toBe('all')
  })
})
