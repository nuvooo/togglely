import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../../shared/auth.guard';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async findAll(@Request() req) {
    return this.organizationsService.findAll(req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.organizationsService.findOne(id, req.user.userId);
  }

  @Post()
  async create(@Body() body: { name: string; slug: string }, @Request() req) {
    return this.organizationsService.create(body, req.user.userId);
  }
}
