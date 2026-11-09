import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'

export interface VariantResult {
  key: string
  name: string
  impressions: number
  conversions: number
  conversionRate: number
  isControl: boolean
}

export interface ExperimentResults {
  variants: VariantResult[]
  totalImpressions: number
  totalConversions: number
  isSignificant: boolean
  confidence: number
  winner: string | null
}

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

type RawRow = Record<string, unknown>

function toRows(raw: unknown): RawRow[] {
  return Array.isArray(raw)
    ? raw.filter((r): r is RawRow => typeof r === 'object' && r !== null)
    : []
}

/** aggregateRaw returns Extended JSON: ObjectIds come back as { $oid }. */
function toIdString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && '$oid' in value) {
    const oid = (value as { $oid: unknown }).$oid
    return typeof oid === 'string' ? oid : null
  }
  return null
}

/** Numbers may come back as plain numbers or Extended JSON ({ $numberInt } / { $numberLong }). */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const inner =
      (value as Record<string, unknown>).$numberInt ??
      (value as Record<string, unknown>).$numberLong ??
      (value as Record<string, unknown>).$numberDouble
    const n = Number(inner)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

@Injectable()
export class ExperimentResultsService {
  private readonly logger = new Logger(ExperimentResultsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getResults(experimentId: string): Promise<ExperimentResults> {
    if (
      typeof experimentId !== 'string' ||
      !OBJECT_ID_PATTERN.test(experimentId)
    ) {
      throw new NotFoundException('Experiment not found')
    }

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    })

    if (!experiment) throw new NotFoundException('Experiment not found')

    // Counting happens inside MongoDB (no per-user lists are loaded into
    // memory). A conversion only counts for a variant if the same user also
    // has an EXPOSURE for that variant; otherwise fabricated conversion events
    // could pick the winner.
    const perVariant = await this.aggregatePerVariant(experiment.id)
    const unassignedConversionCount = await this.countUnassignedConversions(
      experiment.id
    )

    const variantResults: VariantResult[] = experiment.variants.map(
      (variant) => {
        const counts = perVariant.get(variant.id)
        const impressions = counts?.impressions ?? 0
        const conversionCount = counts?.conversions ?? 0
        return {
          key: variant.key,
          name: variant.name,
          impressions,
          conversions: conversionCount,
          conversionRate: impressions > 0 ? conversionCount / impressions : 0,
          isControl: variant.isControl,
        }
      }
    )

    const totalImpressions = variantResults.reduce(
      (sum, v) => sum + v.impressions,
      0
    )
    const totalConversions =
      variantResults.reduce((sum, v) => sum + v.conversions, 0) +
      unassignedConversionCount

    // Calculate statistical significance using Z-test
    const control = variantResults.find((v) => v.isControl)
    let isSignificant = false
    let confidence = 0
    let winner: string | null = null

    if (control && control.impressions >= 30) {
      for (const variant of variantResults) {
        if (variant.isControl) continue
        if (variant.impressions < 30) continue

        const zScore = this.zTestProportions(
          control.conversionRate,
          control.impressions,
          variant.conversionRate,
          variant.impressions
        )

        const pValue = this.zScoreToPValue(Math.abs(zScore))
        const variantConfidence = 1 - pValue

        if (variantConfidence > confidence) {
          confidence = variantConfidence
        }

        if (pValue < 0.05 && variant.conversionRate > control.conversionRate) {
          isSignificant = true
          winner = variant.key
        }
      }
    }

    return {
      variants: variantResults,
      totalImpressions,
      totalConversions,
      isSignificant,
      confidence,
      winner,
    }
  }

  /**
   * Distinct exposed users and distinct exposed-and-converted users per
   * variant. Conversions without a matching exposure of the same variant are
   * ignored.
   */
  private async aggregatePerVariant(
    experimentId: string
  ): Promise<Map<string, { impressions: number; conversions: number }>> {
    const raw = await this.prisma.experimentEvent.aggregateRaw({
      pipeline: [
        {
          $match: {
            experimentId: { $oid: experimentId },
            type: { $in: ['EXPOSURE', 'CONVERSION'] },
            variantId: { $ne: null },
          },
        },
        {
          $group: {
            _id: { variantId: '$variantId', userId: '$userId' },
            exposed: {
              $max: { $cond: [{ $eq: ['$type', 'EXPOSURE'] }, 1, 0] },
            },
            converted: {
              $max: { $cond: [{ $eq: ['$type', 'CONVERSION'] }, 1, 0] },
            },
          },
        },
        { $match: { exposed: 1 } },
        {
          $group: {
            _id: '$_id.variantId',
            impressions: { $sum: 1 },
            conversions: { $sum: '$converted' },
          },
        },
      ],
    })

    const result = new Map<
      string,
      { impressions: number; conversions: number }
    >()
    for (const row of toRows(raw)) {
      const variantId = toIdString(row._id)
      if (!variantId) continue
      result.set(variantId, {
        impressions: toNumber(row.impressions),
        conversions: toNumber(row.conversions),
      })
    }
    return result
  }

  /**
   * Distinct users with a conversion that has no variant (e.g. SDK
   * trackConversion without variant info) who were exposed to some variant
   * of this experiment.
   */
  private async countUnassignedConversions(
    experimentId: string
  ): Promise<number> {
    const hasVariant = { $ne: [{ $ifNull: ['$variantId', null] }, null] }
    const noVariant = { $eq: [{ $ifNull: ['$variantId', null] }, null] }

    const raw = await this.prisma.experimentEvent.aggregateRaw({
      pipeline: [
        {
          $match: {
            experimentId: { $oid: experimentId },
            type: { $in: ['EXPOSURE', 'CONVERSION'] },
          },
        },
        {
          $group: {
            _id: '$userId',
            exposed: {
              $max: {
                $cond: [
                  { $and: [{ $eq: ['$type', 'EXPOSURE'] }, hasVariant] },
                  1,
                  0,
                ],
              },
            },
            unassignedConverted: {
              $max: {
                $cond: [
                  { $and: [{ $eq: ['$type', 'CONVERSION'] }, noVariant] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $match: { exposed: 1, unassignedConverted: 1 } },
        { $count: 'count' },
      ],
    })

    const [row] = toRows(raw)
    return row ? toNumber(row.count) : 0
  }

  /**
   * Z-test for comparing two proportions.
   */
  private zTestProportions(
    p1: number,
    n1: number,
    p2: number,
    n2: number
  ): number {
    if (n1 === 0 || n2 === 0) return 0

    const pPool = (p1 * n1 + p2 * n2) / (n1 + n2)
    if (pPool === 0 || pPool === 1) return 0

    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2))
    if (se === 0) return 0

    return (p2 - p1) / se
  }

  /**
   * Approximate conversion from Z-score to two-tailed p-value.
   * Uses the complementary error function approximation.
   */
  private zScoreToPValue(z: number): number {
    // Approximation of the normal CDF using Abramowitz & Stegun
    const t = 1 / (1 + 0.2316419 * z)
    const d = 0.3989423 * Math.exp((-z * z) / 2)
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    // Two-tailed p-value
    return 2 * p
  }
}
