import { removeFromRuleScopes } from './rule-scope-cleanup'

function setup(rules: Record<string, unknown>[]) {
  const prisma: any = {
    targetingRule: {
      findMany: jest.fn().mockResolvedValue(rules),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ruleCondition: { deleteMany: jest.fn().mockResolvedValue({}) },
  }
  return prisma
}

describe('removeFromRuleScopes', () => {
  it('finds the rules that list the environment', async () => {
    const prisma = setup([])
    await removeFromRuleScopes(prisma, 'environment', 'e1')
    expect(prisma.targetingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { environmentIds: { has: 'e1' } } })
    )
  })

  it('removes the id from rules that still have other environments', async () => {
    const prisma = setup([
      { id: 'r1', environmentIds: ['e1', 'e2'], environmentsExcluded: false },
      { id: 'r2', environmentIds: ['e1'], environmentsExcluded: true },
    ])
    await expect(
      removeFromRuleScopes(prisma, 'environment', 'e1')
    ).resolves.toEqual({ updated: 2, deleted: 0 })
    expect(prisma.targetingRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { environmentIds: ['e2'] },
    })
    // "all except e1" stays "all" once e1 is gone
    expect(prisma.targetingRule.update).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { environmentIds: [] },
    })
  })

  it('deletes rules that only applied to the removed brand', async () => {
    const prisma = setup([
      { id: 'r1', brandIds: ['b1'], brandsExcluded: false },
    ])
    await expect(removeFromRuleScopes(prisma, 'brand', 'b1')).resolves.toEqual({
      updated: 0,
      deleted: 1,
    })
    expect(prisma.ruleCondition.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: { in: ['r1'] } },
    })
    expect(prisma.targetingRule.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
    })
    expect(prisma.targetingRule.update).not.toHaveBeenCalled()
  })
})
