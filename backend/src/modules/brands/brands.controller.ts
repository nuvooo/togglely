import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AccessService } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { CreateBrandDto } from './dto/create-brand.dto'
import { ToggleBrandFlagDto } from './dto/toggle-brand-flag.dto'
import { UpdateBrandDto } from './dto/update-brand.dto'
import { BrandsService } from './brands.service'

@Controller('brands')
@UseGuards(AuthGuard)
export class BrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly access: AccessService
  ) {}

  @Get('project/:projectId')
  async findByProject(@Param('projectId') projectId: string, @Req() req: any) {
    await this.access.assertProjectAccess(req.user.userId, projectId, 'VIEWER')
    const brands = await this.brandsService.findByProject(projectId)
    return { brands }
  }

  @Get(':brandId/flags')
  async findFlags(@Param('brandId') brandId: string, @Req() req: any) {
    await this.access.assertBrandAccess(req.user.userId, brandId, 'VIEWER')
    return this.brandsService.findFlagsForBrand(brandId)
  }

  @Post(':brandId/flags/:flagId/toggle')
  async toggleFlag(
    @Param('brandId') brandId: string,
    @Param('flagId') flagId: string,
    @Body() dto: ToggleBrandFlagDto,
    @Req() req: any
  ) {
    const userId = req.user.userId
    const { brand } = await this.access.assertBrandAccess(
      userId,
      brandId,
      'MEMBER'
    )
    const { flag } = await this.access.assertFlagAccess(
      userId,
      flagId,
      'MEMBER'
    )
    // Brand, flag and environment must all belong to the same project.
    if (flag.projectId !== brand.projectId) {
      throw new NotFoundException('Feature flag not found')
    }
    await this.access.assertEnvironmentInProject(
      dto.environmentId,
      brand.projectId
    )

    return this.brandsService.toggleFlag(
      brandId,
      flagId,
      dto.environmentId,
      dto.enabled
    )
  }

  @Post('project/:projectId')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateBrandDto,
    @Req() req: any
  ) {
    await this.access.assertProjectAccess(req.user.userId, projectId, 'ADMIN')
    const brand = await this.brandsService.create(projectId, dto)
    return { brand }
  }

  @Patch(':brandId')
  async update(
    @Param('brandId') brandId: string,
    @Body() dto: UpdateBrandDto,
    @Req() req: any
  ) {
    await this.access.assertBrandAccess(req.user.userId, brandId, 'ADMIN')
    const brand = await this.brandsService.update(brandId, dto)
    return { brand }
  }

  @Delete(':brandId')
  async delete(@Param('brandId') brandId: string, @Req() req: any) {
    await this.access.assertBrandAccess(req.user.userId, brandId, 'ADMIN')
    await this.brandsService.delete(brandId)
    return { success: true }
  }
}
