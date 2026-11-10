import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

type MigrationClient = Pick<PrismaClient, 'targetingRule' | 'flagEnvironment'>

interface LegacyRule {
  id: string
  flagEnvId: string | null
  priority: number
}

/**
 * Targeting rules used to belong to one FlagEnvironment row (environment
 * default or brand override); a brand with own rules ignored the
 * environment rules. Rules are now flag-wide with a scope. This moves every
 * legacy rule to its flag without changing any result:
 * - brand rule in E: environment E, brand B, ordered first
 * - environment rule in E: environment E; brands that had own rules in E
 *   are excluded ("brand is none of")
 * Priorities are renumbered per flag after existing flag-wide rules.
 *
 * Runs on every start and only touches rules that still have flagEnvId;
 * each update matches the old flagEnvId, so concurrent instances migrate a
 * rule once. Returns the number of migrated rules.
 */
export async function migrateFlagWideRules(
  prisma: MigrationClient,
  logger: Pick<Logger, 'log'> = new Logger('FlagWideRulesMigration')
): Promise<number> {
  const legacy: LegacyRule[] = await prisma.targetingRule.findMany({
    where: { flagEnvId: { not: null } },
    select: { id: true, flagEnvId: true, priority: true },
  })
  if (legacy.length === 0) return 0

  const rows = await prisma.flagEnvironment.findMany({
    where: {
      id: { in: [...new Set(legacy.map((r) => r.flagEnvId as string))] },
    },
    select: { id: true, flagId: true, environmentId: true, brandId: true },
  })
  const rowById = new Map(rows.map((row) => [row.id, row]))

  const byFlag = new Map<
    string,
    { rule: LegacyRule; row: (typeof rows)[number] }[]
  >()
  for (const rule of legacy) {
    const row = rowById.get(rule.flagEnvId as string)
    if (!row) continue // row deleted meanwhile; the rule is unreachable anyway
    byFlag.set(row.flagId, [...(byFlag.get(row.flagId) ?? []), { rule, row }])
  }

  let migrated = 0
  for (const [flagId, entries] of byFlag) {
    // Brands with own rules per environment (they ignored environment rules)
    const brandsWithRules = new Map<string, Set<string>>()
    for (const { row } of entries) {
      if (!row.brandId) continue
      const set = brandsWithRules.get(row.environmentId) ?? new Set<string>()
      set.add(row.brandId)
      brandsWithRules.set(row.environmentId, set)
    }

    const sorted = [...entries].sort(
      (a, b) =>
        Number(a.row.brandId === null) - Number(b.row.brandId === null) ||
        a.row.environmentId.localeCompare(b.row.environmentId) ||
        (a.row.brandId ?? '').localeCompare(b.row.brandId ?? '') ||
        a.rule.priority - b.rule.priority
    )

    const last = await prisma.targetingRule.findFirst({
      where: { flagId },
      orderBy: { priority: 'desc' },
      select: { priority: true },
    })
    let priority = last ? last.priority + 1 : 0

    for (const { rule, row } of sorted) {
      const excludedBrands = row.brandId
        ? []
        : [...(brandsWithRules.get(row.environmentId) ?? [])]
      const { count } = await prisma.targetingRule.updateMany({
        where: { id: rule.id, flagEnvId: rule.flagEnvId },
        data: {
          flagId,
          flagEnvId: null,
          environmentIds: [row.environmentId],
          environmentsExcluded: false,
          brandIds: row.brandId ? [row.brandId] : excludedBrands,
          brandsExcluded: !row.brandId && excludedBrands.length > 0,
          priority: priority++,
        },
      })
      migrated += count
    }
  }

  if (migrated > 0) {
    logger.log(`Flag-wide targeting rules: migrated ${migrated} rules`)
  }
  return migrated
}
