import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService, hasRole } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { ApiKeysService } from './api-keys.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

@Controller('api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly access: AccessService
  ) {}

  @Get('my')
  async findMyKeys(@Req() req: any) {
    const keys = await this.apiKeysService.findByUser(req.user.userId)
    return keys
  }

  @Get('organization/:orgId')
  async findByOrganization(@Param('orgId') orgId: string, @Req() req: any) {
    const membership = await this.access.assertOrgRole(
      req.user.userId,
      orgId,
      'VIEWER'
    )
    const apiKeys = await this.apiKeysService.findByOrganization(
      orgId,
      membership.role,
      req.user.userId
    )
    return { apiKeys }
  }

  @Post('organization/:orgId')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateApiKeyDto,
    @Req() req: any
  ) {
    if (dto.type === 'MCP') {
      await this.access.assertOrgRole(req.user.userId, orgId, 'MEMBER')
      if (dto.projectId) {
        const { project } = await this.access.assertProjectAccess(
          req.user.userId,
          dto.projectId,
          'MEMBER'
        )
        if (project.organizationId !== orgId) {
          throw new NotFoundException('Project not found')
        }
        for (const envId of dto.allowedEnvironmentIds ?? []) {
          await this.access.assertEnvironmentInProject(envId, dto.projectId)
        }
      }
    } else {
      await this.access.assertOrgRole(req.user.userId, orgId, 'ADMIN')
    }
    const key = await this.apiKeysService.create(orgId, req.user.userId, dto)
    return { apiKey: key }
  }

  @Delete(':keyId')
  async delete(@Param('keyId') keyId: string, @Req() req: any) {
    const { apiKey, membership } = await this.access.assertApiKeyAccess(
      req.user.userId,
      keyId,
      'MEMBER'
    )
    const isOwnMcpKey =
      apiKey.type === 'MCP' && apiKey.userId === req.user.userId
    if (!hasRole(membership.role, 'ADMIN') && !isOwnMcpKey) {
      throw new ForbiddenException('Insufficient permissions')
    }
    await this.apiKeysService.delete(apiKey.id, apiKey.organizationId)
    return { success: true }
  }
}
