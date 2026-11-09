import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AccessService, hasRole } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'
import { WebhooksService } from './webhooks.service'

/** Outgoing requests are expensive: limit manual sends per user/IP. */
const SEND_THROTTLE = { default: { ttl: 60_000, limit: 10 } }

/**
 * Project webhooks. Reading requires MEMBER, changing ADMIN. Non-members
 * get 404 (AccessService). Secrets are only returned in plain text by
 * create and rotate-secret. Non-admins see webhook URLs without path and
 * query (`https://host/…`).
 */
@Controller('projects/:projectId/webhooks')
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly access: AccessService
  ) {}

  @Get()
  async list(@Param('projectId') projectId: string, @Req() req: any) {
    const { project, membership } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'MEMBER'
    )
    // URLs may embed credentials: only admins see path and query
    return {
      webhooks: await this.webhooks.list(project.id, {
        fullUrl: hasRole(membership.role, 'ADMIN'),
      }),
    }
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateWebhookDto,
    @Req() req: any
  ) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'ADMIN'
    )
    return this.webhooks.create(
      project.id,
      { userId: req.user.userId, organizationId: project.organizationId },
      dto
    )
  }

  @Patch(':id')
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @Req() req: any
  ) {
    const { webhook, actor } = await this.resolve(req, projectId, id, 'ADMIN')
    return this.webhooks.update(webhook, actor, dto)
  }

  @Delete(':id')
  async delete(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Req() req: any
  ) {
    const { webhook, actor } = await this.resolve(req, projectId, id, 'ADMIN')
    return this.webhooks.delete(webhook, actor)
  }

  @Post(':id/rotate-secret')
  async rotateSecret(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Req() req: any
  ) {
    const { webhook, actor } = await this.resolve(req, projectId, id, 'ADMIN')
    return this.webhooks.rotateSecret(webhook, actor)
  }

  @Post(':id/test')
  @Throttle(SEND_THROTTLE)
  async test(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Req() req: any
  ) {
    const { webhook } = await this.resolve(req, projectId, id, 'ADMIN')
    return this.webhooks.sendTest(webhook)
  }

  @Get(':id/deliveries')
  async deliveries(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Req() req: any
  ) {
    const { webhook } = await this.resolve(req, projectId, id, 'MEMBER')
    const parsed = limit === undefined ? undefined : Number(limit)
    return this.webhooks.listDeliveries(
      webhook,
      Number.isFinite(parsed) ? parsed : undefined
    )
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  @Throttle(SEND_THROTTLE)
  async redeliver(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @Req() req: any
  ) {
    const { webhook } = await this.resolve(req, projectId, id, 'ADMIN')
    return this.webhooks.redeliver(webhook, deliveryId)
  }

  private async resolve(
    req: any,
    projectId: string,
    webhookId: string,
    minRole: 'MEMBER' | 'ADMIN'
  ) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      minRole
    )
    const webhook = await this.webhooks.findInProject(project.id, webhookId)
    return {
      webhook,
      actor: {
        userId: req.user.userId,
        organizationId: project.organizationId,
      },
    }
  }
}
