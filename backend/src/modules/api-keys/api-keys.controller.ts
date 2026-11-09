import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { CreateApiKeyDto } from './dto/create-api-key.dto'
import { ApiKeysService } from './api-keys.service'

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
      membership.role
    )
    return { apiKeys }
  }

  @Post('organization/:orgId')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateApiKeyDto,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, orgId, 'ADMIN')
    const key = await this.apiKeysService.create(orgId, req.user.userId, dto)
    return { apiKey: key }
  }

  @Delete(':keyId')
  async delete(@Param('keyId') keyId: string, @Req() req: any) {
    const { apiKey } = await this.access.assertApiKeyAccess(
      req.user.userId,
      keyId,
      'ADMIN'
    )
    await this.apiKeysService.delete(apiKey.id, apiKey.organizationId)
    return { success: true }
  }
}
