import { Injectable } from '@nestjs/common'

/**
 * MurmurHash3 (32-bit) implementation for deterministic variant assignment.
 * Public Domain by Austin Appleby - no external dependency needed.
 */
@Injectable()
export class HashingService {
  /**
   * MurmurHash3 32-bit implementation.
   */
  murmurhash3(key: string, seed: number = 0): number {
    let h1 = seed >>> 0
    const len = key.length
    const c1 = 0xcc9e2d51
    const c2 = 0x1b873593
    let i = 0

    while (i + 4 <= len) {
      let k1 =
        (key.charCodeAt(i) & 0xff) |
        ((key.charCodeAt(i + 1) & 0xff) << 8) |
        ((key.charCodeAt(i + 2) & 0xff) << 16) |
        ((key.charCodeAt(i + 3) & 0xff) << 24)

      k1 = Math.imul(k1, c1)
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = Math.imul(k1, c2)

      h1 ^= k1
      h1 = (h1 << 13) | (h1 >>> 19)
      h1 = Math.imul(h1, 5) + 0xe6546b64

      i += 4
    }

    let k1 = 0
    const remaining = len - i
    if (remaining >= 3) k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16
    if (remaining >= 2) k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8
    if (remaining >= 1) {
      k1 ^= key.charCodeAt(i) & 0xff
      k1 = Math.imul(k1, c1)
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = Math.imul(k1, c2)
      h1 ^= k1
    }

    h1 ^= len

    // Finalization mix
    h1 ^= h1 >>> 16
    h1 = Math.imul(h1, 0x85ebca6b)
    h1 ^= h1 >>> 13
    h1 = Math.imul(h1, 0xc2b2ae35)
    h1 ^= h1 >>> 16

    return h1 >>> 0
  }

  /**
   * Determine if a user falls within the experiment's traffic allocation.
   * Uses a separate hash from variant assignment so that changing traffic %
   * doesn't reassign existing users to different variants.
   */
  isInTraffic(experimentId: string, userId: string, trafficPercent: number): boolean {
    if (trafficPercent >= 100) return true
    if (trafficPercent <= 0) return false

    const hash = this.murmurhash3(`${experimentId}:${userId}:traffic`)
    const bucket = hash % 100
    return bucket < trafficPercent
  }

  /**
   * Assign a user to a variant based on deterministic hashing.
   * Variants must be sorted by key for consistency.
   *
   * @returns The assigned variant, or null if variants are empty
   */
  assignVariant<T extends { key: string; weight: number }>(
    experimentId: string,
    userId: string,
    variants: T[],
  ): T | null {
    if (variants.length === 0) return null

    const sorted = [...variants].sort((a, b) => a.key.localeCompare(b.key))
    const hash = this.murmurhash3(`${experimentId}:${userId}:variant`)
    const bucket = hash % 100

    let cumWeight = 0
    for (const variant of sorted) {
      cumWeight += variant.weight
      if (bucket < cumWeight) {
        return variant
      }
    }

    // Safety fallback
    return sorted[sorted.length - 1]
  }
}
