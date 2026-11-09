import { describe, expect, it } from 'vitest'
import { countFlagsPerEnvironment, moveEnvironment } from './environments'

const A = { id: 'a' }
const B = { id: 'b' }
const C = { id: 'c' }

describe('moveEnvironment', () => {
  it('swaps with the neighbour', () => {
    expect(moveEnvironment([A, B, C], 'b', 'up')).toEqual([B, A, C])
    expect(moveEnvironment([A, B, C], 'b', 'down')).toEqual([A, C, B])
  })

  it('returns null at the edges and for unknown ids', () => {
    expect(moveEnvironment([A, B, C], 'a', 'up')).toBeNull()
    expect(moveEnvironment([A, B, C], 'c', 'down')).toBeNull()
    expect(moveEnvironment([A, B, C], 'x', 'up')).toBeNull()
  })

  it('does not mutate the input', () => {
    const list = [A, B]
    moveEnvironment(list, 'b', 'up')
    expect(list).toEqual([A, B])
  })
})

describe('countFlagsPerEnvironment', () => {
  it('counts enabled flags per environment against all flags', () => {
    const flags = [
      {
        environments: [
          { environmentId: 'a', enabled: true },
          { environmentId: 'b', enabled: false },
        ],
      },
      {
        environments: [
          { environmentId: 'a', enabled: true },
          { environmentId: 'b', enabled: true },
        ],
      },
      { environments: [{ environmentId: 'a', enabled: false }] },
    ]
    expect(countFlagsPerEnvironment(flags, [A, B, C])).toEqual({
      a: { active: 2, total: 3 },
      b: { active: 1, total: 3 },
      // A new environment has no flag rows yet: all flags, none on
      c: { active: 0, total: 3 },
    })
  })

  it('ignores environments that are not listed and flags without environments', () => {
    expect(
      countFlagsPerEnvironment(
        [{ environments: [{ environmentId: 'x', enabled: true }] }, {}],
        [A]
      )
    ).toEqual({
      a: { active: 0, total: 2 },
    })
  })
})
