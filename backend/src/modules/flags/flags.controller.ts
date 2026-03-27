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
import { AuthGuard } from '../../shared/auth.guard'
import type { CreateFlagDto } from './dto/create-flag.dto'
import type { ToggleFlagDto } from './dto/toggle-flag.dto'
import type { UpdateFlagDto } from './dto/update-flag.dto'
import type { UpdateFlagEnvironmentDto } from './dto/update-flag-environment.dto'
import type { UpdateFlagValueDto } from './dto/update-flag-value.dto'
import type { FlagsService } from './flags.service'

@Controller('feature-flags')
@UseGuards(AuthGuard)
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get()
  async findAll(
    @Req() req: any,
    @Query('projectId') projectId?: string,
    @Query('environmentId') environmentId?: string
  ) {
    const flags = await this.flagsService.findAll(
      req.user.userId,
      projectId,
      environmentId
    )
    return { featureFlags: flags }
  }

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string) {
    const flags = await this.flagsService.findByProject(projectId);
    return { featureFlags: flags };
  }

  @Get(':flagId')
  async findOne(@Param('flagId') flagId: string) {
    const flag = await this.flagsService.findOne(flagId);
    return { featureFlag: flag };
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateFlagDto,
    @Req() req: any
  ) {
    return this.flagsService.create(projectId, req.user.userId, dto)
  }

  @Patch(':flagId')
  async update(
    @Param('flagId') flagId: string,
    @Body() dto: UpdateFlagDto
  ) {
    const flag = await this.flagsService.update(flagId, dto)
    return { featureFlag: flag }
  }

  @Post(':flagId/toggle')
  async toggle(
    @Param('flagId') flagId: string,
    @Body() dto: ToggleFlagDto
  ) {
    return this.flagsService.toggle(flagId, dto.environmentId, dto.enabled)
  }

  @Get(':flagId/environments')
  async getEnvironments(@Param('flagId') flagId: string) {
    const envs = await this.flagsService.getEnvironments(flagId);
    return { environments: envs };
  }

  @Patch(':flagId/environments/:envId')
  async updateEnvironment(
    @Param('flagId') flagId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateFlagEnvironmentDto
  ) {
    return this.flagsService.updateEnvironment(flagId, envId, dto)
  }

  @Patch(':flagId/environments/:envId/value')
  async updateValue(
    @Param('flagId') flagId: string,
    @Param('envId') envId: string,
    @Body() dto: UpdateFlagValueDto
  ) {
    return this.flagsService.updateValue(flagId, envId, dto)
  }

  @Delete(':flagId')
  async delete(@Param('flagId') flagId: string, @Req() req: any) {
    await this.flagsService.delete(flagId, req.user.userId)
    return { success: true }
  }
}
