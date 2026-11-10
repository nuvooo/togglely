import {
  ConditionTreeError,
  evaluateTree,
  parseConditionTree,
  ruleTree,
  treeLeaves,
} from './condition-tree'

const leaf = (attribute: string, value: string, operator = 'EQUALS') => ({
  type: 'condition' as const,
  attribute,
  operator: operator as any,
  value,
})
const matchContext = (context: Record<string, string>) => (l: any) =>
  context[l.attribute] === l.value

describe('evaluateTree', () => {
  // country = DE AND (plan = pro OR NOT (beta = no, email = x))
  const tree = {
    type: 'AND' as const,
    children: [
      leaf('country', 'DE'),
      {
        type: 'OR' as const,
        children: [
          leaf('plan', 'pro'),
          {
            type: 'NOT' as const,
            children: [leaf('beta', 'no'), leaf('email', 'x')],
          },
        ],
      },
    ],
  }

  it.each([
    [{ country: 'DE', plan: 'pro' }, true],
    [{ country: 'DE', plan: 'free', beta: 'yes' }, true],
    [{ country: 'DE', plan: 'free', beta: 'no' }, false],
    [{ country: 'DE', plan: 'free', email: 'x' }, false],
    [{ country: 'AT', plan: 'pro' }, false],
  ])('%j -> %s', (context, expected) => {
    expect(evaluateTree(tree, matchContext(context))).toBe(expected)
  })

  it('NOT matches when none of its children match', () => {
    const not = {
      type: 'NOT' as const,
      children: [leaf('a', '1'), leaf('b', '2')],
    }
    expect(evaluateTree(not, matchContext({}))).toBe(true)
    expect(evaluateTree(not, matchContext({ b: '2' }))).toBe(false)
  })

  it('an empty AND root matches (rule without conditions)', () => {
    expect(evaluateTree({ type: 'AND', children: [] }, () => false)).toBe(true)
  })
})

describe('ruleTree', () => {
  const c = (id: string, attribute: string, groupIndex?: number) => ({
    id,
    attribute,
    operator: 'EQUALS' as const,
    value: 'v',
    groupIndex,
  })

  it('uses the stored tree', () => {
    const stored = { type: 'OR', children: [leaf('a', '1')] }
    expect(
      ruleTree({ operator: 'AND', conditionTree: stored, conditions: [] })
    ).toBe(stored)
  })

  it('turns a flat legacy rule into one block with its operator', () => {
    expect(
      ruleTree({
        operator: 'OR',
        groupOperators: [],
        conditions: [c('1', 'a'), c('2', 'b')],
      })
    ).toEqual({
      type: 'OR',
      children: [
        { type: 'condition', attribute: 'a', operator: 'EQUALS', value: 'v' },
        { type: 'condition', attribute: 'b', operator: 'EQUALS', value: 'v' },
      ],
    })
  })

  it('turns legacy groups into blocks; single conditions stay leaves', () => {
    const tree = ruleTree({
      operator: 'AND',
      groupOperators: ['AND', 'OR'],
      conditions: [c('1', 'a', 0), c('2', 'b', 1), c('3', 'c', 1)],
    })
    expect(tree).toEqual({
      type: 'AND',
      children: [
        { type: 'condition', attribute: 'a', operator: 'EQUALS', value: 'v' },
        {
          type: 'OR',
          children: [
            {
              type: 'condition',
              attribute: 'b',
              operator: 'EQUALS',
              value: 'v',
            },
            {
              type: 'condition',
              attribute: 'c',
              operator: 'EQUALS',
              value: 'v',
            },
          ],
        },
      ],
    })
  })

  it('gives an empty AND root for a rule without conditions', () => {
    expect(ruleTree({ operator: 'OR', conditions: [] })).toEqual({
      type: 'AND',
      children: [],
    })
  })
})

describe('treeLeaves', () => {
  it('lists all conditions depth-first', () => {
    const tree = {
      type: 'OR' as const,
      children: [
        { type: 'NOT' as const, children: [leaf('a', '1')] },
        leaf('b', '2'),
      ],
    }
    expect(treeLeaves(tree).map((l) => l.attribute)).toEqual(['a', 'b'])
  })
})

describe('parseConditionTree', () => {
  const valid = {
    type: 'AND',
    children: [
      leaf('country', 'DE'),
      { type: 'NOT', children: [leaf('email', '@test.de', 'ENDS_WITH')] },
    ],
  }

  it('accepts a valid tree and keeps only known fields', () => {
    const parsed = parseConditionTree({
      ...valid,
      extra: 1,
      children: [{ ...leaf('country', 'DE'), id: 'x', __proto__x: 1 }],
    })
    expect(parsed).toEqual({ type: 'AND', children: [leaf('country', 'DE')] })
  })

  it.each([
    ['a non-object', 'nope'],
    ['a NOT root', { type: 'NOT', children: [leaf('a', '1')] }],
    ['a condition root', leaf('a', '1')],
    ['an empty root', { type: 'AND', children: [] }],
    [
      'an empty nested block',
      { type: 'AND', children: [{ type: 'OR', children: [] }] },
    ],
    [
      'an unknown node type',
      { type: 'AND', children: [{ type: 'XOR', children: [leaf('a', '1')] }] },
    ],
    ['a bad attribute', { type: 'AND', children: [leaf('__proto__ x', '1')] }],
    [
      'an unknown operator',
      { type: 'AND', children: [leaf('a', '1', 'EVAL')] },
    ],
    [
      'a non-string value',
      { type: 'AND', children: [{ ...leaf('a', '1'), value: 5 }] },
    ],
    [
      'more than 20 conditions',
      {
        type: 'AND',
        children: Array.from({ length: 21 }, () => leaf('a', '1')),
      },
    ],
    [
      'more than 5 levels',
      {
        type: 'AND',
        children: [
          {
            type: 'OR',
            children: [
              {
                type: 'AND',
                children: [
                  {
                    type: 'OR',
                    children: [
                      {
                        type: 'NOT',
                        children: [{ type: 'AND', children: [leaf('a', '1')] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  ])('rejects %s', (_, input) => {
    expect(() => parseConditionTree(input)).toThrow(ConditionTreeError)
  })

  it('accepts exactly 5 levels', () => {
    const fiveLevels = {
      type: 'AND',
      children: [
        {
          type: 'OR',
          children: [
            {
              type: 'AND',
              children: [
                {
                  type: 'NOT',
                  children: [{ type: 'OR', children: [leaf('a', '1')] }],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(() => parseConditionTree(fiveLevels)).not.toThrow()
  })
})
