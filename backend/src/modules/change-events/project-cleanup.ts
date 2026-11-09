import { Prisma } from '@prisma/client'

type CleanupClient = Pick<
  Prisma.TransactionClient,
  'configVersion' | 'webhook' | 'webhookDelivery'
>

/**
 * Removes the change-notification data of a project (configuration
 * versions, webhooks and their deliveries). MongoDB has no cascading
 * deletes, so every place that deletes a project must call this.
 */
export async function deleteProjectChangeData(
  db: CleanupClient,
  projectId: string
): Promise<void> {
  await db.configVersion.deleteMany({ where: { projectId } })

  const webhooks = await db.webhook.findMany({
    where: { projectId },
    select: { id: true },
  })
  if (webhooks.length > 0) {
    await db.webhookDelivery.deleteMany({
      where: { webhookId: { in: webhooks.map((w) => w.id) } },
    })
  }
  await db.webhook.deleteMany({ where: { projectId } })
}
