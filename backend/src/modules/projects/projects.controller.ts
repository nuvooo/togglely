import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Response } from 'express'
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { CreateProjectDto } from './dto/create-project.dto'
import { ImportFlagsDto } from './dto/import-flags.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { ProjectsService } from './projects.service'

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly access: AccessService
  ) {}

  @Get()
  async findAll(@Req() req: any) {
    const projects = await this.projectsService.findAll(req.user.userId)
    return { projects }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, id, 'VIEWER')
    const project = await this.projectsService.findOne(id)
    return { project }
  }

  @Get(':id/flags-with-brands')
  async getFlagsWithBrands(@Param('id') id: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, id, 'VIEWER')
    return this.projectsService.getFlagsWithBrands(id)
  }

  @Get(':id/environments')
  async getEnvironments(@Param('id') id: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, id, 'VIEWER')
    const envs = await this.projectsService.getEnvironments(id)
    return { environments: envs }
  }

  @Get('organization/:orgId')
  async findByOrganization(@Param('orgId') orgId: string, @Req() req: any) {
    await this.access.assertOrgRole(req.user.userId, orgId, 'VIEWER')
    const projects = await this.projectsService.findByOrganization(orgId)
    return { projects }
  }

  @Post('organization/:orgId')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateProjectDto,
    @Req() req: any
  ) {
    await this.access.assertOrgRole(req.user.userId, orgId, 'ADMIN')
    const project = await this.projectsService.create(
      orgId,
      req.user.userId,
      dto
    )
    return { project }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: any
  ) {
    await this.access.assertProjectAccess(req.user.userId, id, 'ADMIN')
    const project = await this.projectsService.update(id, dto)
    return { project }
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, id, 'ADMIN')
    await this.projectsService.delete(id, req.user.userId)
    return { success: true }
  }

  // Import/Export Feature Flags
  @Get(':id/export')
  async exportFlags(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    await this.access.assertProjectAccess(req.user.userId, id, 'VIEWER')
    const exportData = await this.projectsService.exportFlags(id)

    // Keep the filename header-safe (no quotes, CR/LF or non-ASCII).
    const safeName =
      String(exportData.projectName).replace(/[^a-zA-Z0-9_.-]/g, '_') ||
      'project'

    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}-flags.json"`
    )
    res.send(JSON.stringify(exportData, null, 2))
  }

  @Post(':id/import')
  async importFlags(
    @Param('id') id: string,
    @Body() dto: ImportFlagsDto,
    @Req() req: any
  ) {
    await this.access.assertProjectAccess(req.user.userId, id, 'ADMIN')
    const result = await this.projectsService.importFlags(
      id,
      req.user.userId,
      dto.flags,
      dto.options
    )
    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    }
  }
}
