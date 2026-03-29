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

@Injectable()
export class ExperimentResultsService {
  private readonly logger = new Logger(ExperimentResultsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getResults(experimentId: string): Promise<ExperimentResults> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    })

    if (!experiment) throw new NotFoundException('Experiment not found')

    // Aggregate events per variant using distinct userId
    const variantResults: VariantResult[] = []

    for (const variant of experiment.variants) {
      // Count distinct users who saw the variant (exposures)
      const exposures = await this.prisma.experimentEvent.findMany({
        where: {
          experimentId,
          variantId: variant.id,
          type: 'EXPOSURE',
        },
        distinct: ['userId'],
        select: { userId: true },
      })
      const impressions = exposures.length

      // Count distinct users who converted
      const conversions = await this.prisma.experimentEvent.findMany({
        where: {
          experimentId,
          variantId: variant.id,
          type: 'CONVERSION',
        },
        distinct: ['userId'],
        select: { userId: true },
      })
      const conversionCount = conversions.length

      variantResults.push({
        key: variant.key,
        name: variant.name,
        impressions,
        conversions: conversionCount,
        conversionRate: impressions > 0 ? conversionCount / impressions : 0,
        isControl: variant.isControl,
      })
    }

    // Also count conversions tracked without a specific variant
    // (e.g., from SDK trackConversion which doesn't know the variant)
    const unassignedConversions = await this.prisma.experimentEvent.findMany({
      where: {
        experimentId,
        variantId: null,
        type: 'CONVERSION',
      },
      distinct: ['userId'],
      select: { userId: true },
    })

    const totalImpressions = variantResults.reduce((sum, v) => sum + v.impressions, 0)
    const totalConversions = variantResults.reduce((sum, v) => sum + v.conversions, 0) + unassignedConversions.length

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
          variant.impressions,
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
   * Z-test for comparing two proportions.
   */
  private zTestProportions(
    p1: number,
    n1: number,
    p2: number,
    n2: number,
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
