import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import {
  CreateEnvironmentDto,
  CreateEnvironmentWithProjectDto,
} from './dto/create-environment.dto'
import { ReorderEnvironmentsDto } from './dto/reorder-environments.dto'
import { UpdateEnvironmentDto } from './dto/update-environment.dto'
import { EnvironmentsService } from './environments.service'

@Controller('environments')
@UseGuards(AuthGuard)
export class EnvironmentsController {
  constructor(
    private readonly envsService: EnvironmentsService,
    private readonly access: AccessService
  ) {}

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, projectId, 'VIEWER')
    const envs = await this.envsService.findByProject(projectId)
    return { environments: envs }
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEnvironmentDto,
    @Req() req: any
  ) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'ADMIN'
    )
    const env = await this.envsService.create(
      project.id,
      project.organizationId,
      dto
    )
    return { environment: env }
  }

  @Post()
  async createGlobal(
    @Body() dto: CreateEnvironmentWithProjectDto,
    @Req() req: any
  ) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      dto.projectId,
      'ADMIN'
    )
    const env = await this.envsService.create(
      project.id,
      project.organizationId,
      { name: dto.name, key: dto.key }
    )
    return { environment: env }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
    @Req() req: any
  ) {
    await this.access.assertEnvironmentAccess(req.user.userId, id, 'ADMIN')
    const env = await this.envsService.update(id, dto)
    return { environment: env }
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.access.assertEnvironmentAccess(req.user.userId, id, 'ADMIN')
    await this.envsService.delete(id)
    return { success: true }
  }

  @Post('project/:projectId/reorder')
  async reorder(
    @Param('projectId') projectId: string,
    @Body() dto: ReorderEnvironmentsDto,
    @Req() req: any
  ) {
    const { project } = await this.access.assertProjectAccess(
      req.user.userId,
      projectId,
      'ADMIN'
    )
    const environments = await this.envsService.reorder(
      project.id,
      project.organizationId,
      req.user.userId,
      dto.environmentIds
    )
    return { environments }
  }
}
