import { HashingService } from './hashing.service'

describe('HashingService', () => {
  let service: HashingService

  beforeEach(() => {
    service = new HashingService()
  })

  describe('murmurhash3', () => {
    it('should be deterministic', () => {
      const hash1 = service.murmurhash3('test-key')
      const hash2 = service.murmurhash3('test-key')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different keys', () => {
      const hash1 = service.murmurhash3('key-a')
      const hash2 = service.murmurhash3('key-b')
      expect(hash1).not.toBe(hash2)
    })

    it('should return a positive 32-bit integer', () => {
      const hash = service.murmurhash3('test')
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xffffffff)
    })
  })

  describe('isInTraffic', () => {
    it('should always include at 100%', () => {
      expect(service.isInTraffic('exp-1', 'user-1', 100)).toBe(true)
    })

    it('should always exclude at 0%', () => {
      expect(service.isInTraffic('exp-1', 'user-1', 0)).toBe(false)
    })

    it('should be deterministic for same user', () => {
      const result1 = service.isInTraffic('exp-1', 'user-1', 50)
      const result2 = service.isInTraffic('exp-1', 'user-1', 50)
      expect(result1).toBe(result2)
    })

    it('should approximately match the traffic percentage at scale', () => {
      let included = 0
      const total = 10000
      for (let i = 0; i < total; i++) {
        if (service.isInTraffic('exp-1', `user-${i}`, 50)) {
          included++
        }
      }
      // Allow ±3% tolerance
      expect(included / total).toBeGreaterThan(0.47)
      expect(included / total).toBeLessThan(0.53)
    })
  })

  describe('assignVariant', () => {
    const variants = [
      { key: 'control', weight: 50 },
      { key: 'variant_a', weight: 50 },
    ]

    it('should return null for empty variants', () => {
      expect(service.assignVariant('exp-1', 'user-1', [])).toBeNull()
    })

    it('should be deterministic', () => {
      const v1 = service.assignVariant('exp-1', 'user-1', variants)
      const v2 = service.assignVariant('exp-1', 'user-1', variants)
      expect(v1?.key).toBe(v2?.key)
    })

    it('should distribute approximately according to weights at scale', () => {
      const counts: Record<string, number> = { control: 0, variant_a: 0 }
      const total = 10000
      for (let i = 0; i < total; i++) {
        const v = service.assignVariant('exp-1', `user-${i}`, variants)
        if (v) counts[v.key]++
      }
      // Allow ±3% tolerance for 50/50 split
      expect(counts.control / total).toBeGreaterThan(0.47)
      expect(counts.control / total).toBeLessThan(0.53)
    })

    it('should handle 3-way split', () => {
      const threeWay = [
        { key: 'a', weight: 33 },
        { key: 'b', weight: 34 },
        { key: 'c', weight: 33 },
      ]
      const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
      const total = 10000
      for (let i = 0; i < total; i++) {
        const v = service.assignVariant('exp-1', `user-${i}`, threeWay)
        if (v) counts[v.key]++
      }
      // Each should be roughly 33%
      for (const key of ['a', 'b', 'c']) {
        expect(counts[key] / total).toBeGreaterThan(0.28)
        expect(counts[key] / total).toBeLessThan(0.38)
      }
    })

    it('should maintain variant assignment when traffic increases', () => {
      // Users in 50% traffic should keep same variant when traffic goes to 100%
      const assignments50: string[] = []
      for (let i = 0; i < 100; i++) {
        const userId = `user-${i}`
        if (service.isInTraffic('exp-1', userId, 50)) {
          const v = service.assignVariant('exp-1', userId, variants)
          assignments50.push(`${userId}:${v?.key}`)
        }
      }

      // Same users should get same variants regardless of traffic change
      for (const assignment of assignments50) {
        const [userId, variantKey] = assignment.split(':')
        const v = service.assignVariant('exp-1', userId, variants)
        expect(v?.key).toBe(variantKey)
      }
    })
  })
})
