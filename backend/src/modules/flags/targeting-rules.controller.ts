import {
  BadRequestException,
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
 * Targeting rules of a feature flag, scoped per environment and optionally
 * per brand (brand override).
 * VIEWER may read, MEMBER+ may change rules.
 */
@Controller('feature-flags/:flagId/targeting-rules')
@UseGuards(AuthGuard)
export class TargetingRulesController {
  constructor(
    private readonly rulesService: TargetingRulesService,
    private readonly access: AccessService
  ) {}

  /**
   * Rules of the environment, or of a brand (`brandId`, needs
   * `environmentId`). `inherited`: the brand has no own rules and the
   * environment rules apply.
   */
  @Get()
  async findAll(
    @Param('flagId') flagId: string,
    @Req() req: any,
    @Query('environmentId') environmentId?: string,
    @Query('brandId') brandId?: string
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'VIEWER'
    )
    if (brandId && !environmentId) {
      throw new BadRequestException('brandId requires environmentId')
    }
    if (environmentId) {
      await this.access.assertEnvironmentInProject(environmentId, flag.projectId)
    }
    if (brandId) {
      await this.access.assertBrandInProject(brandId, flag.projectId)
    }
    return this.rulesService.findAll(flagId, environmentId, brandId)
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
    if (dto.brandId) {
      await this.access.assertBrandInProject(dto.brandId, flag.projectId)
    }
    const rule = await this.rulesService.create(flag, dto, req.user.userId)
    return { rule }
  }

  /** Deletes the own rules of a brand; it inherits the environment rules again. */
  @Delete()
  async resetBrandRules(
    @Param('flagId') flagId: string,
    @Req() req: any,
    @Query('environmentId') environmentId: string,
    @Query('brandId') brandId: string
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'MEMBER'
    )
    if (!environmentId || !brandId) {
      throw new BadRequestException('environmentId and brandId are required')
    }
    await this.access.assertEnvironmentInProject(environmentId, flag.projectId)
    await this.access.assertBrandInProject(brandId, flag.projectId)
    return this.rulesService.resetBrandRules(
      flag,
      environmentId,
      brandId,
      req.user.userId
    )
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
