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
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import {
  CreateTargetingRuleDto,
  UpdateTargetingRuleDto,
} from './dto/targeting-rule.dto'
import { TargetingRulesService } from './targeting-rules.service'

/**
 * Targeting rules of a feature flag, scoped per environment.
 * VIEWER may read, MEMBER+ may change rules.
 */
@Controller('feature-flags/:flagId/targeting-rules')
@UseGuards(AuthGuard)
export class TargetingRulesController {
  constructor(
    private readonly rulesService: TargetingRulesService,
    private readonly access: AccessService
  ) {}

  @Get()
  async findAll(
    @Param('flagId') flagId: string,
    @Req() req: any,
    @Query('environmentId') environmentId?: string
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'VIEWER'
    )
    if (environmentId) {
      await this.access.assertEnvironmentInProject(environmentId, flag.projectId)
    }
    return { rules: await this.rulesService.findAll(flagId, environmentId) }
  }

  @Post()
  async create(
    @Param('flagId') flagId: string,
    @Body() dto: CreateTargetingRuleDto,
    @Req() req: any
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'MEMBER'
    )
    await this.access.assertEnvironmentInProject(
      dto.environmentId,
      flag.projectId
    )
    const rule = await this.rulesService.create(flag, dto, req.user.userId)
    return { rule }
  }

  @Patch(':ruleId')
  async update(
    @Param('flagId') flagId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateTargetingRuleDto,
    @Req() req: any
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'MEMBER'
    )
    const rule = await this.rulesService.update(
      flag,
      ruleId,
      dto,
      req.user.userId
    )
    return { rule }
  }

  @Delete(':ruleId')
  async delete(
    @Param('flagId') flagId: string,
    @Param('ruleId') ruleId: string,
    @Req() req: any
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'MEMBER'
    )
    await this.rulesService.delete(flag, ruleId, req.user.userId)
    return { success: true }
  }
}
