import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { AUDIT_LOG_MAX_LIMIT, AuditLogsService } from './audit-logs.service'

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly access: AccessService
  ) {}

  /**
   * Latest entries of a project. `entityId` narrows them to one entity (plus
   * entries naming it as `flagId`), `limit` defaults to 100 (max 200).
   */
  @Get('project/:projectId')
  async findAll(
    @Param('projectId') projectId: string,
    @Req() req: any,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string
  ) {
    if (entityId !== undefined && !isObjectId(entityId)) {
      throw new BadRequestException('entityId must be an ObjectId')
    }
    let take: number | undefined
    if (limit !== undefined) {
      take = Number(limit)
      if (!Number.isInteger(take) || take < 1 || take > AUDIT_LOG_MAX_LIMIT) {
        throw new BadRequestException(
          `limit must be an integer between 1 and ${AUDIT_LOG_MAX_LIMIT}`
        )
      }
    }
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'VIEWER'
    )
    const auditLogs = await this.auditLogsService.findAll(project.id, {
      entityId,
      limit: take,
    })
    return { auditLogs }
  }

  @Get('organization/:organizationId')
  async findByOrganization(
    @Param('organizationId') organizationId: string,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, organizationId, 'VIEWER')
    const auditLogs =
      await this.auditLogsService.findByOrganization(organizationId)
    return { auditLogs }
  }

  /** Latest logs across all organizations the caller is a member of. */
  @Get()
  async findAllForUser(@Req() req: any) {
    const auditLogs = await this.auditLogsService.findForUser(req.user.userId)
    return { auditLogs }
  }
}
