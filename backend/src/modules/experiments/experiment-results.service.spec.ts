import { NotFoundException } from '@nestjs/common'
import { ExperimentResultsService } from './experiment-results.service'

const mockExperiment = {
  id: 'exp-1',
  key: 'header-test',
  variants: [
    {
      id: 'var-1',
      key: 'control',
      name: 'Control',
      isControl: true,
    },
    {
      id: 'var-2',
      key: 'treatment',
      name: 'Treatment',
      isControl: false,
    },
  ],
}

function createService() {
  const prisma = {
    experiment: {
      findUnique: jest.fn(),
    },
    experimentEvent: {
      findMany: jest.fn(),
    },
  } as any

  const service = new ExperimentResultsService(prisma)
  return { service, prisma }
}

describe('ExperimentResultsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getResults', () => {
    it('returns results with impressions, conversions, and rates', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      // Control: 100 users exposed, 20 converted
      prisma.experimentEvent.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 20 }, (_, i) => ({ userId: `cu-${i}` }))
        )
      // Treatment: 100 users exposed, 30 converted
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 30 }, (_, i) => ({ userId: `tu-${i}` }))
        )
      // Unassigned conversions: 5
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({ userId: `ua-${i}` }))
        )

      const result = await service.getResults('exp-1')

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

    it('returns no significance when control has fewer than 30 impressions', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        variants: [
          { id: 'var-1', key: 'control', isControl: true },
          { id: 'var-2', key: 'treatment', isControl: false },
        ],
      })

      prisma.experimentEvent.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 10 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getResults('exp-1')

      expect(result.isSignificant).toBe(false)
      expect(result.winner).toBeNull()
      expect(result.confidence).toBe(0)
    })

    it('identifies a winner when conversion is significantly better', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        variants: [
          { id: 'var-1', key: 'control', isControl: true },
          { id: 'var-2', key: 'treatment', isControl: false },
        ],
      })

      prisma.experimentEvent.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 1000 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 1000 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 200 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce([])

      const result = await service.getResults('exp-1')

      expect(result.isSignificant).toBe(true)
      expect(result.winner).toBe('treatment')
      expect(result.confidence).toBeGreaterThan(0.95)
    })

    it('does not declare winner when conversion is lower than control', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue({
        ...mockExperiment,
        variants: [
          { id: 'var-1', key: 'control', isControl: true },
          { id: 'var-2', key: 'treatment', isControl: false },
        ],
      })

      prisma.experimentEvent.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 1000 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 200 }, (_, i) => ({ userId: `cu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 1000 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, (_, i) => ({ userId: `tu-${i}` }))
        )
        .mockResolvedValueOnce([])

      const result = await service.getResults('exp-1')

      expect(result.winner).toBeNull()
    })

    it('throws NotFoundException when experiment does not exist', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(null)

      await expect(service.getResults('missing')).rejects.toBeInstanceOf(
        NotFoundException
      )
    })

    it('handles experiments with no events', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)
      prisma.experimentEvent.findMany.mockResolvedValue([])

      const result = await service.getResults('exp-1')

      expect(result.variants).toHaveLength(2)
      expect(result.variants.every((v) => v.impressions === 0)).toBe(true)
      expect(result.totalImpressions).toBe(0)
      expect(result.totalConversions).toBe(0)
      expect(result.isSignificant).toBe(false)
      expect(result.winner).toBeNull()
    })

    it('uses distinct userId queries for accurate counting', async () => {
      const { service, prisma } = createService()
      prisma.experiment.findUnique.mockResolvedValue(mockExperiment)

      prisma.experimentEvent.findMany
        .mockResolvedValueOnce([
          { userId: 'u1' },
          { userId: 'u2' },
        ])
        .mockResolvedValueOnce([
          { userId: 'u1' },
        ])
        .mockResolvedValueOnce([
          { userId: 'u3' },
          { userId: 'u4' },
        ])
        .mockResolvedValueOnce([
          { userId: 'u3' },
        ])
        .mockResolvedValueOnce([])

      const result = await service.getResults('exp-1')

      expect(result.variants[0].impressions).toBe(2)
      expect(result.variants[0].conversions).toBe(1)
      expect(result.variants[1].impressions).toBe(2)
      expect(result.variants[1].conversions).toBe(1)
    })
  })
})
