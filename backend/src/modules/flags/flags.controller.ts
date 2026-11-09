import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { CreateFlagDto } from './dto/create-flag.dto'
import { ToggleFlagDto } from './dto/toggle-flag.dto'
import { UpdateFlagDto } from './dto/update-flag.dto'
import { UpdateFlagEnvironmentDto } from './dto/update-flag-environment.dto'
import { UpdateFlagValueDto } from './dto/update-flag-value.dto'
import { FlagsService } from './flags.service'

@Controller('feature-flags')
@UseGuards(AuthGuard)
export class FlagsController {
  constructor(
    private readonly flagsService: FlagsService,
    private readonly access: AccessService
  ) {}

  /**
   * Lists flags. With `projectId` the caller must be a member of the
   * project's organization; without it, results are restricted to the
   * organizations the caller belongs to.
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('environmentId') environmentId?: string
  ) {
    const userId = req.user.userId
    if (projectId) {
      await this.access.assertProjectAccess(userId, projectId, 'VIEWER')
      if (environmentId) {
        await this.access.assertEnvironmentInProject(environmentId, projectId)
      }
    }

    const flags = await this.flagsService.findAll(
      userId,
      projectId || undefined,
      projectId ? environmentId || undefined : undefined
    )
    return { featureFlags: flags }
  }

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, projectId, 'VIEWER')
    const flags = await this.flagsService.findByProject(projectId)
    return { featureFlags: flags }
  }

  @Get(':flagId')
  async findOne(@Param('flagId') flagId: string, @Req() req: any) {
    await this.access.assertFlagAccess(req.user.userId, flagId, 'VIEWER')
    const flag = await this.flagsService.findOne(flagId)
    return { featureFlag: flag }
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateFlagDto,
    @Req() req: any
  ) {
    await this.access.assertProjectAccess(req.user.userId, projectId, 'MEMBER')
    return this.flagsService.create(projectId, req.user.userId, dto)
  }

  @Patch(':flagId')
  async update(
    @Param('flagId') flagId: string,
    @Body() dto: UpdateFlagDto,
    @Req() req: any
  ) {
    await this.access.assertFlagAccess(req.user.userId, flagId, 'MEMBER')
    const flag = await this.flagsService.update(flagId, dto)
    return { featureFlag: flag }
  }

  @Post(':flagId/toggle')
  async toggle(
    @Param('flagId') flagId: string,
    @Body() dto: ToggleFlagDto,
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
    return this.flagsService.toggle(flagId, dto.environmentId, dto.enabled)
  }

  @Get(':flagId/environments')
  async getEnvironments(@Param('flagId') flagId: string, @Req() req: any) {
    await this.access.assertFlagAccess(req.user.userId, flagId, 'VIEWER')
    const envs = await this.flagsService.getEnvironments(flagId)
    return { environments: envs }
  }

  /**
   * `envId` may be either a FlagEnvironment id or an Environment id; the
   * service only resolves records that belong to `flagId`.
   */
  @Patch(':flagId/environments/:envId')
  async updateEnvironment(
    @Param('flagId') flagId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateFlagEnvironmentDto,
    @Req() req: any
  ) {
    await this.access.assertFlagAccess(req.user.userId, flagId, 'MEMBER')
    if (!isObjectId(envId)) {
      throw new NotFoundException('Flag environment not found')
    }
    return this.flagsService.updateEnvironment(flagId, envId, dto)
  }

  @Patch(':flagId/environments/:envId/value')
  async updateValue(
    @Param('flagId') flagId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateFlagValueDto,
    @Req() req: any
  ) {
    const { flag } = await this.access.assertFlagAccess(
      req.user.userId,
      flagId,
      'MEMBER'
    )
    await this.access.assertEnvironmentInProject(envId, flag.projectId)
    if (dto.brandId) {
      await this.access.assertBrandInProject(dto.brandId, flag.projectId)
    }
    return this.flagsService.updateValue(flagId, envId, dto)
  }

  @Delete(':flagId')
  async delete(@Param('flagId') flagId: string, @Req() req: any) {
    await this.access.assertFlagAccess(req.user.userId, flagId, 'ADMIN')
    await this.flagsService.delete(flagId, req.user.userId)
    return { success: true }
  }
}
