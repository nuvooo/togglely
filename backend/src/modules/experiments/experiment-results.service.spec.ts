import { NotFoundException } from '@nestjs/common'
import { ExperimentResultsService } from './experiment-results.service'

const EXP_ID = '64b7f0c2a1b2c3d4e5f60001'
const VAR_CONTROL = '64b7f0c2a1b2c3d4e5f60011'
const VAR_TREATMENT = '64b7f0c2a1b2c3d4e5f60012'

const mockExperiment = {
  id: EXP_ID,
  key: 'header-test',
  variants: [
    {
      id: VAR_CONTROL,
      key: 'control',
      name: 'Control',
      isControl: true,
    },
    {
      id: VAR_TREATMENT,
      key: 'treatment',
      name: 'Treatment',
      isControl: false,
    },
  ],
}

type RawEvent = {
  type: 'EXPOSURE' | 'CONVERSION' | 'CUSTOM'
  userId: string
  variantId: string | null
}

/**
 * Minimal in-memory evaluation of the two aggregation pipelines used by the
 * service, so tests exercise the real counting semantics (distinct users,
 * conversions require a matching exposure) rather than call order.
 */
function simulateAggregate(events: RawEvent[], pipeline: any[]): any[] {
  const isPerVariant = pipeline[0].$match.variantId !== undefined
  if (isPerVariant) {
    const users = new Map<string, { v: string; e: number; c: number }>()
    for (const ev of events) {
      if (!ev.variantId || ev.type === 'CUSTOM') continue
      const k = `${ev.variantId}|${ev.userId}`
      const row = users.get(k) ?? { v: ev.variantId, e: 0, c: 0 }
      if (ev.type === 'EXPOSURE') row.e = 1
      if (ev.type === 'CONVERSION') row.c = 1
      users.set(k, row)
    }
    const perVariant = new Map<
      string,
      { impressions: number; conversions: number }
    >()
    for (const row of users.values()) {
      if (row.e !== 1) continue
      const agg = perVariant.get(row.v) ?? { impressions: 0, conversions: 0 }
      agg.impressions += 1
      agg.conversions += row.c
      perVariant.set(row.v, agg)
    }
    // Extended JSON shape as returned by Prisma aggregateRaw
    return [...perVariant.entries()].map(([v, agg]) => ({
      _id: { $oid: v },
      ...agg,
    }))
  }

  const users = new Map<string, { e: number; u: number }>()
  for (const ev of events) {
    const row = users.get(ev.userId) ?? { e: 0, u: 0 }
    if (ev.type === 'EXPOSURE' && ev.variantId) row.e = 1
    if (ev.type === 'CONVERSION' && !ev.variantId) row.u = 1
    users.set(ev.userId, row)
  }
  const count = [...users.values()].filter((r) => r.e && r.u).length
  return count > 0 ? [{ count }] : []
}

function createService(events: RawEvent[] = []) {
  const prisma = {
    experiment: {
      findUnique: jest.fn(),
    },
    experimentEvent: {
      findMany: jest.fn(),
      aggregateRaw: jest.fn(async ({ pipeline }: any) =>
        simulateAggregate(events, pipeline)
      ),
    },
  } as any

  const service = new ExperimentResultsService(prisma)
  return { service, prisma }
}

function users(prefix: string, count: number, offset = 0): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i + offset}`)
}

function exposures(variantId: string, userIds: string[]): RawEvent[] {
  return userIds.map((userId) => ({ type: 'EXPOSURE', userId, variantId }))
}

function conversions(variantId: string | null, userIds: string[]): RawEvent[] {
  return userIds.map((userId) => ({ type: 'CONVERSION', userId, variantId }))
}

describe('ExperimentResultsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getResults', () => {
    it('returns results with impressions, conversions, and rates', async () => {
      const events = [
        ...exposures(VAR_CONTROL, users('cu', 100)),
        ...conversions(VAR_CONTROL, users('cu', 20)),
        ...exposures(VAR_TREATMENT, users('tu', 100)),
        ...conversions(VAR_TREATMENT, users('tu', 30)),
        // 5 variant-less conversions from exposed users
        ...conversions(null, users('cu', 5, 50)),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.variants).toHaveLength(2)
      const control = result.variants.find((v) => v.isControl)!
      expect(control.impressions).toBe(100)
      expect(control.conversions).toBe(20)
      expect(control.conversionRate).toBe(0.2)

      const treatment = result.variants.find((v) => !v.isControl)!
      expect(treatment.impressions).toBe(100)
      expect(treatment.conversions).toBe(30)
      expect(treatment.conversionRate).toBe(0.3)

      expect(result.totalImpressions).toBe(200)
      expect(result.totalConversions).toBe(55)
    })

    it('ignores conversions from users without an exposure for that variant', async () => {
      const events = [
        ...exposures(VAR_CONTROL, users('cu', 1000)),
        ...conversions(VAR_CONTROL, users('cu', 100)),
        ...exposures(VAR_TREATMENT, users('tu', 1000)),
        ...conversions(VAR_TREATMENT, users('tu', 100)),
        // Forged: 500 conversions for treatment by users never exposed
        ...conversions(VAR_TREATMENT, users('fake', 500)),
        // Forged: control-exposed users converting on treatment
        ...conversions(VAR_TREATMENT, users('cu', 200)),
        // Forged: variant-less conversions by unknown users
        ...conversions(null, users('ghost', 300)),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      const treatment = result.variants.find((v) => !v.isControl)!
      expect(treatment.conversions).toBe(100)
      expect(treatment.conversionRate).toBe(0.1)
      expect(result.totalConversions).toBe(200)
      expect(result.winner).toBeNull()
      expect(result.isSignificant).toBe(false)
    })

    it('counts distinct users only', async () => {
      const events = [
        ...exposures(VAR_CONTROL, ['u1', 'u1', 'u2']),
        ...conversions(VAR_CONTROL, ['u1', 'u1']),
        ...exposures(VAR_TREATMENT, ['u3', 'u4', 'u4']),
        ...conversions(VAR_TREATMENT, ['u3']),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.variants[0].impressions).toBe(2)
      expect(result.variants[0].conversions).toBe(1)
      expect(result.variants[1].impressions).toBe(2)
      expect(result.variants[1].conversions).toBe(1)
    })

    it('scopes aggregation to the experiment id', async () => {
      const { service, prisma } = createService([])
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      await service.getResults(EXP_ID)

      expect(prisma.experimentEvent.aggregateRaw).toHaveBeenCalledTimes(2)
      for (const [args] of prisma.experimentEvent.aggregateRaw.mock.calls) {
        expect(args.pipeline[0].$match.experimentId).toEqual({ $oid: EXP_ID })
      }
      expect(prisma.experimentEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns no significance when control has fewer than 30 impressions', async () => {
      const events = [
        ...exposures(VAR_CONTROL, users('cu', 10)),
        ...exposures(VAR_TREATMENT, users('tu', 100)),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.isSignificant).toBe(false)
      expect(result.winner).toBeNull()
      expect(result.confidence).toBe(0)
    })

    it('identifies a winner when conversion is significantly better', async () => {
      const events = [
        ...exposures(VAR_CONTROL, users('cu', 1000)),
        ...conversions(VAR_CONTROL, users('cu', 100)),
        ...exposures(VAR_TREATMENT, users('tu', 1000)),
        ...conversions(VAR_TREATMENT, users('tu', 200)),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.isSignificant).toBe(true)
      expect(result.winner).toBe('treatment')
      expect(result.confidence).toBeGreaterThan(0.95)
    })

    it('does not declare winner when conversion is lower than control', async () => {
      const events = [
        ...exposures(VAR_CONTROL, users('cu', 1000)),
        ...conversions(VAR_CONTROL, users('cu', 200)),
        ...exposures(VAR_TREATMENT, users('tu', 1000)),
        ...conversions(VAR_TREATMENT, users('tu', 100)),
      ]
      const { service, prisma } = createService(events)
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.winner).toBeNull()
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.getResults(EXP_ID)).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('throws NotFoundException for malformed ids without querying', async () => {
      const { service, prisma } = createService()

      await expect(service.getResults('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
      expect(prisma.experiment.findUnique).not.toHaveBeenCalled()
    })

    it('handles experiments with no events', async () => {
      const { service, prisma } = createService([])
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      const result = await service.getResults(EXP_ID)

      expect(result.variants).toHaveLength(2)
      expect(result.variants.every((v) => v.impressions === 0)).toBe(true)
      expect(result.totalImpressions).toBe(0)
      expect(result.totalConversions).toBe(0)
      expect(result.isSignificant).toBe(false)
      expect(result.winner).toBeNull()
    })

    it('accepts Extended JSON numbers from aggregateRaw', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)
      prisma.experimentEvent.aggregateRaw
        .mockResolvedValueOnce([
          {
            _id: { $oid: VAR_CONTROL },
            impressions: { $numberLong: '40' },
            conversions: { $numberInt: '4' },
          },
        ])
        .mockResolvedValueOnce([{ count: { $numberInt: '3' } }])

      const result = await service.getResults(EXP_ID)

      expect(result.variants[0].impressions).toBe(40)
      expect(result.variants[0].conversions).toBe(4)
      expect(result.totalConversions).toBe(7)
    })
  })
})
