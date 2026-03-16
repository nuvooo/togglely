import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AuthGuard } from '../../shared/auth.guard';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@Req() req: any) {
    const projects = await this.projectsService.findAll(req.user.userId);
    return { projects };
  }

  @Get('organization/:orgId')
  async findByOrganization(
    @Param('orgId') orgId: string,
    @Req() req: any,
  ) {
    const projects = await this.projectsService.findByOrganization(orgId, req.user.userId);
    return projects;
  }

  @Post('organization/:orgId')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateProjectDto,
    @Req() req: any,
  ) {
    const project = await this.projectsService.create(orgId, req.user.userId, dto);
    return { project };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.projectsService.delete(id, req.user.userId);
    return { success: true };
  }
}
