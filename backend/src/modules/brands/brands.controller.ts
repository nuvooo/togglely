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
import type { CreateBrandDto } from './dto/create-brand.dto'
import type { UpdateBrandDto } from './dto/update-brand.dto'
import type { BrandsService } from './brands.service'

@Controller('brands')
@UseGuards(AuthGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string) {
    const brands = await this.brandsService.findByProject(projectId);
    return { brands };
  }

  @Get(':brandId/flags')
  async findFlags(@Param('brandId') brandId: string) {
    return this.brandsService.findFlagsForBrand(brandId);
  }

  @Post(':brandId/flags/:flagId/toggle')
  async toggleFlag(
    @Param('brandId') brandId: string,
    @Param('flagId') flagId: string,
    @Body() body: { environmentId: string; enabled?: boolean }
  ) {
    return this.brandsService.toggleFlag(
      brandId,
      flagId,
      body.environmentId,
      body.enabled
    )
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBrandDto
  ) {
    const brand = await this.brandsService.create(projectId, dto)
    return { brand }
  }

  @Patch(':brandId')
  async update(
    @Param('brandId') brandId: string,
    @Body() dto: UpdateBrandDto
  ) {
    const brand = await this.brandsService.update(brandId, dto)
    return { brand }
  }

  @Delete(':brandId')
  async delete(@Param('brandId') brandId: string) {
    await this.brandsService.delete(brandId);
    return { success: true };
  }
}
