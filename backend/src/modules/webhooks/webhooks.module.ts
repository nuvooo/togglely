import { Module } from '@nestjs/common'
import {
  WEBHOOK_SENDER,
  WebhookDeliveryService,
} from './webhook-delivery.service'
import { WebhookDispatcher } from './webhook-dispatcher'
import { sendWebhookRequest } from './webhook-http'
import { WebhookWorker } from './webhook-worker'
import { WebhooksController } from './webhooks.controller'
import { WebhooksService } from './webhooks.service'

/**
 * Signed outgoing webhooks for configuration changes: API, dispatcher
 * (ChangeBus → delivery queue) and the delivery worker.
 */
@Module({
  controllers: [WebhooksController],
  providers: [
    { provide: WEBHOOK_SENDER, useValue: sendWebhookRequest },
    WebhookDeliveryService,
    WebhookWorker,
    WebhookDispatcher,
    WebhooksService,
  ],
})
export class WebhooksModule {}
