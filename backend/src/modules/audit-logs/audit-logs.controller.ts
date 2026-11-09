import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { AuditLogsService } from './audit-logs.service'

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly access: AccessService
  ) {}

  @Get('project/:projectId')
  async findAll(@Param('projectId') projectId: string, @Req() req: any) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'VIEWER'
    )
    const auditLogs = await this.auditLogsService.findAll(project.id)
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
