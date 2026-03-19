import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../../shared/auth.guard';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get()
  async findAll(@Req() req: any) {
    const orgs = await this.orgsService.findAll(req.user.userId);
    return { organizations: orgs };
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const stats = await this.orgsService.getStats(req.user.userId);
    return stats;
  }

  @Get('my')
  async getMyOrg(@Req() req: any) {
    const org = await this.orgsService.findByUser(req.user.userId);
    return { organization: org };
  }

  @Post()
  async create(@Body() body: { name: string; slug?: string }, @Req() req: any) {
    const org = await this.orgsService.create(body.name, body.slug, req.user.userId);
    return { organization: org };
  }

  // Members - Define BEFORE the generic :id route to avoid shadowing
  @Get(':id/members')
  async getMembers(@Param('id') id: string) {
    const members = await this.orgsService.getMembers(id);
    return { members };
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { email: string; role?: string },
  ) {
    const member = await this.orgsService.addMember(id, body.email, body.role || 'MEMBER');
    return { member };
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.orgsService.removeMember(id, userId);
    return { success: true };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const org = await this.orgsService.findOne(id);
    return { organization: org };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    const org = await this.orgsService.update(id, body);
    return { organization: org };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.orgsService.delete(id);
    return { success: true };
  }
}
