import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ExperimentStatus } from '@prisma/client'
import { AccessService, isObjectId } from '../../shared/access/access.service'
import { AuthGuard } from '../../shared/auth.guard'
import { ExperimentsService } from './experiments.service'
import { ExperimentResultsService } from './experiment-results.service'
import {
  CreateExperimentDto,
  CreateVariantDto,
  UpdateVariantDto,
} from './dto/create-experiment.dto'
import { UpdateExperimentDto } from './dto/update-experiment.dto'

@Controller('experiments')
@UseGuards(AuthGuard)
export class ExperimentsController {
  constructor(
    private readonly experimentsService: ExperimentsService,
    private readonly resultsService: ExperimentResultsService,
    private readonly access: AccessService
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateExperimentDto) {
    const userId = req.user.userId
    const { flag } = await this.access.assertFlagAccess(
      userId,
      dto.flagId,
      'MEMBER'
    )
    await this.access.assertEnvironmentInProject(
      dto.environmentId,
      flag.projectId
    )
    return this.experimentsService.create(userId, dto)
  }

  @Get()
  async findAll(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('status', new ParseEnumPipe(ExperimentStatus, { optional: true }))
    status?: ExperimentStatus
  ) {
    if (!isObjectId(projectId)) {
      throw new BadRequestException('A valid projectId is required')
    }
    await this.access.assertProjectAccess(req.user.userId, projectId, 'VIEWER')
    return this.experimentsService.findAll(projectId, status)
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'VIEWER')
    return this.experimentsService.findOne(id)
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'VIEWER')
    return this.resultsService.getResults(id)
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExperimentDto,
    @Req() req: any
  ) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.update(id, dto)
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'ADMIN')
    return this.experimentsService.delete(id, req.user.userId)
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.start(id, req.user.userId)
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.pause(id, req.user.userId)
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Req() req: any) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.complete(id, req.user.userId)
  }

  // --- Variant endpoints ---

  @Post(':id/variants')
  async addVariant(
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
    @Req() req: any
  ) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.addVariant(id, dto)
  }

  @Patch(':id/variants/:variantId')
  async updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
    @Req() req: any
  ) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.updateVariant(id, variantId, dto)
  }

  @Delete(':id/variants/:variantId')
  async deleteVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Req() req: any
  ) {
    await this.access.assertExperimentAccess(req.user.userId, id, 'MEMBER')
    return this.experimentsService.deleteVariant(id, variantId)
  }
}
