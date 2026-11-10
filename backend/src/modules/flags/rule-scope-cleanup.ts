import { PrismaClient } from '@prisma/client'

type CleanupClient = Pick<PrismaClient, 'targetingRule' | 'ruleCondition'>

/**
 * Removes a deleted environment or brand from the scope of all targeting
 * rules. A rule that applied only to the removed ids ("one of" with nothing
 * left) is deleted; otherwise it would suddenly apply everywhere. "None of"
 * lists just lose the id.
 */
export async function removeFromRuleScopes(
  prisma: CleanupClient,
  kind: 'environment' | 'brand',
  id: string
): Promise<{ updated: number; deleted: number }> {
  const rules =
    kind === 'environment'
      ? (
          await prisma.targetingRule.findMany({
            where: { environmentIds: { has: id } },
            select: {
              id: true,
              environmentIds: true,
              environmentsExcluded: true,
            },
          })
        ).map((r) => ({
          id: r.id,
          ids: r.environmentIds,
          excluded: r.environmentsExcluded,
        }))
      : (
          await prisma.targetingRule.findMany({
            where: { brandIds: { has: id } },
            select: { id: true, brandIds: true, brandsExcluded: true },
          })
        ).map((r) => ({
          id: r.id,
          ids: r.brandIds,
          excluded: r.brandsExcluded,
        }))

  const obsolete: string[] = []
  let updated = 0
  for (const rule of rules) {
    const remaining = rule.ids.filter((x) => x !== id)
    if (remaining.length === 0 && !rule.excluded) {
      obsolete.push(rule.id)
      continue
    }
    await prisma.targetingRule.update({
      where: { id: rule.id },
      data:
        kind === 'environment'
          ? { environmentIds: remaining }
          : { brandIds: remaining },
    })
    updated++
  }

  if (obsolete.length > 0) {
    await prisma.ruleCondition.deleteMany({
      where: { ruleId: { in: obsolete } },
    })
    await prisma.targetingRule.deleteMany({ where: { id: { in: obsolete } } })
  }
  return { updated, deleted: obsolete.length }
}
