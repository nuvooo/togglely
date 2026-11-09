import { PrismaClient } from '@prisma/client'

/**
 * One-time startup migrations coordinate through marker documents in the
 * `migrations` collection: `{ _id, startedAt, completedAt? }`. Inserting the
 * marker claims the migration (unique _id); `completedAt` is set on success.
 */

/** An unfinished marker older than this belongs to a killed process. */
export const STALE_MARKER_MS = 15 * 60_000

export type MarkerClient = Pick<PrismaClient, '$runCommandRaw'>

export const mongoDate = (date: Date) => ({ $date: date.toISOString() })

function isDuplicateKey(value: unknown): boolean {
  const text =
    value instanceof Error ? value.message : JSON.stringify(value ?? '')
  return /E11000|duplicate key|"code":\s*11000/i.test(text)
}

/**
 * Takes over an existing marker that never completed and is older than
 * STALE_MARKER_MS (the process running it was killed). The conditional update
 * is atomic, so only one instance wins the takeover.
 */
async function takeOverStaleMarker(
  prisma: MarkerClient,
  id: string
): Promise<boolean> {
  const now = new Date()
  const result = (await prisma.$runCommandRaw({
    update: 'migrations',
    updates: [
      {
        q: {
          _id: id,
          completedAt: { $exists: false },
          startedAt: {
            $lt: mongoDate(new Date(now.getTime() - STALE_MARKER_MS)),
          },
        },
        u: { $set: { startedAt: mongoDate(now) } },
      },
    ],
  })) as { n?: number }
  return (result?.n ?? 0) > 0
}

/**
 * Claims the one-time marker. Returns false when the migration already ran
 * or another instance is running it (the marker insert hits a duplicate key
 * and the existing marker is completed or still fresh).
 */
export async function claimMigrationMarker(
  prisma: MarkerClient,
  id: string
): Promise<boolean> {
  try {
    const result = (await prisma.$runCommandRaw({
      insert: 'migrations',
      documents: [{ _id: id, startedAt: mongoDate(new Date()) }],
    })) as { writeErrors?: unknown[] }
    if (result?.writeErrors?.length) {
      if (isDuplicateKey(result.writeErrors)) {
        return takeOverStaleMarker(prisma, id)
      }
      throw new Error(JSON.stringify(result.writeErrors))
    }
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return takeOverStaleMarker(prisma, id)
    throw error
  }
}

/** Marks the migration as done; `extra` fields are stored on the marker. */
export async function completeMigrationMarker(
  prisma: MarkerClient,
  id: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await prisma.$runCommandRaw({
    update: 'migrations',
    updates: [
      {
        q: { _id: id },
        u: { $set: { completedAt: mongoDate(new Date()), ...extra } },
      },
    ],
  } as any)
}

/** Releases the marker after a failure so the next boot retries. */
export async function releaseMigrationMarker(
  prisma: MarkerClient,
  id: string
): Promise<void> {
  await prisma
    .$runCommandRaw({
      delete: 'migrations',
      deletes: [{ q: { _id: id }, limit: 1 }],
    })
    .catch(() => undefined)
}
