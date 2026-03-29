import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ExperimentStatus } from '@prisma/client'
import { AuthGuard } from '../../shared/auth.guard'
import { ExperimentsService } from './experiments.service'
import { ExperimentResultsService } from './experiment-results.service'
import { CreateExperimentDto, CreateVariantDto } from './dto/create-experiment.dto'
import { UpdateExperimentDto } from './dto/update-experiment.dto'

@Controller('experiments')
@UseGuards(AuthGuard)
export class ExperimentsController {
  constructor(
    private readonly experimentsService: ExperimentsService,
    private readonly resultsService: ExperimentResultsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateExperimentDto) {
    return this.experimentsService.create(req.user.sub, dto)
  }

  @Get()
  async findAll(
    @Query('projectId') projectId: string,
    @Query('status') status?: ExperimentStatus,
  ) {
    return this.experimentsService.findAll(projectId, status)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.experimentsService.findOne(id)
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string) {
    return this.resultsService.getResults(id)
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateExperimentDto) {
    return this.experimentsService.update(id, dto)
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.experimentsService.delete(id, req.user.sub)
  }

  @Post(':id/start')
  async start(@Param('id') id: string, @Req() req: any) {
    return this.experimentsService.start(id, req.user.sub)
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string, @Req() req: any) {
    return this.experimentsService.pause(id, req.user.sub)
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Req() req: any) {
    return this.experimentsService.complete(id, req.user.sub)
  }

  // --- Variant endpoints ---

  @Post(':id/variants')
  async addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.experimentsService.addVariant(id, dto)
  }

  @Patch(':id/variants/:variantId')
  async updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: Partial<CreateVariantDto>,
  ) {
    return this.experimentsService.updateVariant(id, variantId, dto)
  }

  @Delete(':id/variants/:variantId')
  async deleteVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.experimentsService.deleteVariant(id, variantId)
  }
}
