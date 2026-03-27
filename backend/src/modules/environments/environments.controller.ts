import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../../shared/auth.guard'
import type { CreateEnvironmentDto } from './dto/create-environment.dto'
import type { UpdateEnvironmentDto } from './dto/update-environment.dto'
import type { EnvironmentsService } from './environments.service'

@Controller('environments')
@UseGuards(AuthGuard)
export class EnvironmentsController {
  constructor(private readonly envsService: EnvironmentsService) {}

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string) {
    const envs = await this.envsService.findByProject(projectId);
    return { environments: envs };
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEnvironmentDto
  ) {
    const env = await this.envsService.create(projectId, dto)
    return { environment: env }
  }

  @Post()
  async createGlobal(@Body() body: { name: string; key: string; projectId: string; organizationId: string }) {
    const env = await this.envsService.create(body.projectId, {
      name: body.name,
      key: body.key,
      organizationId: body.organizationId,
    });
    return { environment: env };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateEnvironmentDto) {
    const env = await this.envsService.update(id, dto)
    return { environment: env }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.envsService.delete(id);
    return { success: true };
  }

  @Post('project/:projectId/reorder')
  async reorder(
    @Param('projectId') projectId: string,
    @Body() body: { environmentIds: string[] }
  ) {
    // For now, just return success - reordering would require an order field
    return { success: true }
  }
}
