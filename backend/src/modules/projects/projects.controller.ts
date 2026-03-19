import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, Res } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AuthGuard } from '../../shared/auth.guard';
import { Response } from 'express';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(@Req() req: any) {
    const projects = await this.projectsService.findAll(req.user.userId);
    return { projects };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const project = await this.projectsService.findOne(id);
    return { project };
  }

  @Get(':id/flags-with-brands')
  async getFlagsWithBrands(@Param('id') id: string) {
    return this.projectsService.getFlagsWithBrands(id);
  }

  @Get(':id/environments')
  async getEnvironments(@Param('id') id: string) {
    const envs = await this.projectsService.getEnvironments(id);
    return { environments: envs };
  }

  @Get('organization/:orgId')
  async findByOrganization(@Param('orgId') orgId: string) {
    const projects = await this.projectsService.findByOrganization(orgId);
    return { projects };
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

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; type?: 'SINGLE' | 'MULTI'; allowedOrigins?: string[] },
  ) {
    const project = await this.projectsService.update(id, body);
    return { project };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.projectsService.delete(id, req.user.userId);
    return { success: true };
  }

  // Import/Export Feature Flags
  @Get(':id/export')
  async exportFlags(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const exportData = await this.projectsService.exportFlags(id);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.projectName}-flags.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  }

  @Post(':id/import')
  async importFlags(
    @Param('id') id: string,
    @Body() body: { flags: any[]; options?: { overwrite?: boolean; skipExisting?: boolean } },
    @Req() req: any,
  ) {
    const result = await this.projectsService.importFlags(id, req.user.userId, body.flags, body.options);
    return { 
      success: true, 
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors 
    };
  }
}
