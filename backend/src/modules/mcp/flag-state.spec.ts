import { collectFlagStates, findDivergentStates } from './flag-state'

const envs = [
  { id: 'e1', key: 'dev' },
  { id: 'e2', key: 'prod' },
]
const brands = [{ id: 'b1', key: 'acme' }]

describe('collectFlagStates', () => {
  it('missing env row counts as off/default', () => {
    const rows = collectFlagStates(
      {
        flagType: 'BOOLEAN',
        flagEnvironments: [
          {
            environmentId: 'e1',
            brandId: null,
            enabled: true,
            defaultValue: 'true',
          },
        ],
      },
      envs,
      brands
    )
    expect(rows).toEqual([
      { environmentKey: 'dev', brandKey: null, enabled: true, value: 'true' },
      {
        environmentKey: 'prod',
        brandKey: null,
        enabled: false,
        value: 'false',
      },
    ])
  })

  it('brand override is listed with brandKey', () => {
    const rows = collectFlagStates(
      {
        flagType: 'BOOLEAN',
        flagEnvironments: [
          {
            environmentId: 'e1',
            brandId: null,
            enabled: true,
            defaultValue: 'true',
          },
          {
            environmentId: 'e1',
            brandId: 'b1',
            enabled: false,
            defaultValue: 'false',
          },
        ],
      },
      envs,
      brands
    )
    expect(rows).toContainEqual({
      environmentKey: 'dev',
      brandKey: 'acme',
      enabled: false,
      value: 'false',
    })
    expect(rows).toHaveLength(3)
  })
})

describe('findDivergentStates', () => {
  const row = (
    environmentKey: string,
    enabled: boolean,
    value: string,
    brandKey: string | null = null
  ) => ({ environmentKey, brandKey, enabled, value })

  it('returns [] when all equal', () => {
    expect(
      findDivergentStates([row('dev', true, 'true'), row('prod', true, 'true')])
    ).toEqual([])
  })

  it('single brand override off while all envs on -> divergent contains that brand row', () => {
    const brandRow = row('prod', false, 'false', 'acme')
    const result = findDivergentStates([
      row('dev', true, 'true'),
      row('prod', true, 'true'),
      brandRow,
    ])
    expect(result).toEqual([brandRow])
  })

  it('STRING flag with differing values -> divergent', () => {
    const result = findDivergentStates([
      row('dev', true, 'a'),
      row('prod', true, 'b'),
    ])
    expect(result).toEqual([row('prod', true, 'b')])
  })
})
