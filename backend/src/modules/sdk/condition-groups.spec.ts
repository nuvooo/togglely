import { groupConditions } from './condition-groups'

const cond = (id: string, groupIndex?: number | null) => ({
  id,
  attribute: 'a',
  operator: 'EQUALS' as const,
  value: id,
  groupIndex,
})

describe('groupConditions', () => {
  it('treats a rule without group operators as one group with its operator', () => {
    expect(
      groupConditions({
        operator: 'OR',
        groupOperators: [],
        conditions: [cond('a'), cond('b', null)],
      })
    ).toEqual([{ operator: 'OR', conditions: [cond('a'), cond('b', null)] }])
  })

  it('also handles a missing groupOperators field', () => {
    expect(
      groupConditions({ operator: 'AND', conditions: [cond('a')] })
    ).toEqual([{ operator: 'AND', conditions: [cond('a')] }])
  })

  it('buckets conditions by groupIndex with the operator of each group', () => {
    expect(
      groupConditions({
        operator: 'AND',
        groupOperators: ['AND', 'OR'],
        conditions: [cond('a', 0), cond('b', 1), cond('c', 1)],
      })
    ).toEqual([
      { operator: 'AND', conditions: [cond('a', 0)] },
      { operator: 'OR', conditions: [cond('b', 1), cond('c', 1)] },
    ])
  })

  it('keeps the condition order inside a group and drops empty groups', () => {
    const groups = groupConditions({
      operator: 'OR',
      groupOperators: ['AND', 'AND', 'OR'],
      conditions: [cond('x', 2), cond('a', 0), cond('y', 2)],
    })
    expect(groups.map((g) => g.conditions.map((c) => c.id))).toEqual([
      ['a'],
      ['x', 'y'],
    ])
    expect(groups.map((g) => g.operator)).toEqual(['AND', 'OR'])
  })

  it('returns no groups for a rule without conditions', () => {
    expect(
      groupConditions({ operator: 'AND', groupOperators: [], conditions: [] })
    ).toEqual([])
  })
})
