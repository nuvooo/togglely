import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ExperimentStatus } from '@prisma/client'
import { isObjectId } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { ChangeEventsService } from '../change-events/change-events.service'
import {
  CreateExperimentDto,
  CreateVariantDto,
  UpdateVariantDto,
} from './dto/create-experiment.dto'
import { UpdateExperimentDto } from './dto/update-experiment.dto'

@Injectable()
export class ExperimentsService {
  private readonly logger = new Logger(ExperimentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly changes: ChangeEventsService
  ) {}

  async create(userId: string, dto: CreateExperimentDto) {
    // Verify flag exists
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: dto.flagId },
    })
    if (!flag) throw new NotFoundException('Feature flag not found')

    // Verify environment exists AND belongs to the flag's project, so an
    // experiment can never link a flag to another tenant's environment.
    const environment = await this.prisma.environment.findUnique({
      where: { id: dto.environmentId },
    })
    if (!environment || environment.projectId !== flag.projectId) {
      throw new NotFoundException('Environment not found')
    }

    // Check no RUNNING experiment for this flag+environment
    const existing = await this.prisma.experiment.findFirst({
      where: {
        flagId: dto.flagId,
        environmentId: dto.environmentId,
        status: { in: ['RUNNING', 'PAUSED'] },
      },
    })
    if (existing) {
      throw new ConflictException(
        'An active experiment already exists for this flag and environment'
      )
    }

    // Keys are unique per project (@@unique([projectId, key])): a duplicate
    // is a conflict, not a server error.
    const experiment = await this.prisma.experiment
      .create({
        data: {
          name: dto.name,
          key: dto.key.trim().toLowerCase(),
          description: dto.description,
          hypothesis: dto.hypothesis,
          flag: { connect: { id: dto.flagId } },
          environment: { connect: { id: dto.environmentId } },
          trafficPercent: dto.trafficPercent ?? 100,
          createdBy: { connect: { id: userId } },
          project: { connect: { id: flag.projectId } },
          organization: { connect: { id: flag.organizationId } },
        },
        include: { variants: true },
      })
      .catch((error: unknown) => {
        if (isPrismaUniqueConstraintError(error)) {
          throw new ConflictException({
            message:
              'An experiment with this key already exists in this project',
            error: 'Conflict',
            code: 'EXPERIMENT_KEY_TAKEN',
          })
        }
        throw error
      })

    // Create variants if provided
    if (dto.variants && dto.variants.length > 0) {
      for (const v of dto.variants) {
        await this.prisma.experimentVariant.create({
          data: {
            experiment: { connect: { id: experiment.id } },
            key: v.key,
            name: v.name,
            description: v.description,
            value: v.value,
            weight: v.weight,
            isControl: v.isControl ?? false,
          },
        })
      }
    }

    const result = await this.prisma.experiment.findUnique({
      where: { id: experiment.id },
      include: { variants: true, flag: true, environment: true },
    })

    await this.auditLogs.create({
      action: 'experiment.created',
      entityType: 'Experiment',
      entityId: experiment.id,
      userId,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      newValues: { name: experiment.name, key: experiment.key },
    })

    return result
  }

  async findAll(projectId: string, status?: ExperimentStatus) {
    // Prisma drops `undefined` filters, which would list every tenant's
    // experiments. Refuse to query without a project scope.
    if (!projectId) throw new BadRequestException('projectId is required')

    const where: Record<string, unknown> = { projectId }
    if (status) where.status = status

    return this.prisma.experiment.findMany({
      where,
      include: {
        variants: true,
        flag: true,
        environment: true,
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
      include: {
        variants: true,
        flag: true,
        environment: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    })

    if (!experiment) throw new NotFoundException('Experiment not found')
    return experiment
  }

  async update(id: string, dto: UpdateExperimentDto) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new BadRequestException(
        'Can only update experiments in DRAFT or PAUSED status'
      )
    }

    return this.prisma.experiment.update({
      where: { id },
      data: dto,
      include: { variants: true },
    })
  }

  async delete(id: string, userId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only delete experiments in DRAFT status'
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.experimentEvent.deleteMany({ where: { experimentId: id } })
      await tx.experimentVariant.deleteMany({ where: { experimentId: id } })
      await tx.experiment.delete({ where: { id } })
    })

    await this.auditLogs.create({
      action: 'experiment.deleted',
      entityType: 'Experiment',
      entityId: id,
      userId,
      organizationId: experiment.organizationId,
      projectId: experiment.projectId,
      oldValues: { name: experiment.name, key: experiment.key },
    })
  }

  async start(id: string, userId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
      include: { variants: true },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new BadRequestException(
        'Can only start experiments in DRAFT or PAUSED status'
      )
    }

    // Validate: at least 2 variants
    if (experiment.variants.length < 2) {
      throw new BadRequestException('Experiment must have at least 2 variants')
    }

    // Validate: exactly 1 control
    const controls = experiment.variants.filter((v) => v.isControl)
    if (controls.length !== 1) {
      throw new BadRequestException(
        'Experiment must have exactly 1 control variant'
      )
    }

    // Validate: weights sum to 100
    const totalWeight = experiment.variants.reduce(
      (sum, v) => sum + v.weight,
      0
    )
    if (totalWeight !== 100) {
      throw new BadRequestException(
        `Variant weights must sum to 100, currently ${totalWeight}`
      )
    }

    // Check no other RUNNING experiment for same flag+environment
    const running = await this.prisma.experiment.findFirst({
      where: {
        flagId: experiment.flagId,
        environmentId: experiment.environmentId,
        status: 'RUNNING',
        id: { not: id },
      },
    })
    if (running) {
      throw new ConflictException(
        'Another experiment is already running for this flag and environment'
      )
    }

    const updated = await this.prisma.experiment.update({
      where: { id },
      data: {
        status: 'RUNNING',
        startedAt: experiment.startedAt ?? new Date(),
      },
      include: { variants: true },
    })
    await this.recordExperimentChanged(experiment)

    await this.auditLogs.create({
      action: 'experiment.started',
      entityType: 'Experiment',
      entityId: id,
      userId,
      organizationId: experiment.organizationId,
      projectId: experiment.projectId,
      oldValues: { status: experiment.status },
      newValues: { status: 'RUNNING' },
    })

    return updated
  }

  async pause(id: string, userId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'RUNNING') {
      throw new BadRequestException('Can only pause RUNNING experiments')
    }

    const updated = await this.prisma.experiment.update({
      where: { id },
      data: { status: 'PAUSED' },
      include: { variants: true },
    })
    await this.recordExperimentChanged(experiment)

    await this.auditLogs.create({
      action: 'experiment.paused',
      entityType: 'Experiment',
      entityId: id,
      userId,
      organizationId: experiment.organizationId,
      projectId: experiment.projectId,
    })

    return updated
  }

  async complete(id: string, userId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'RUNNING' && experiment.status !== 'PAUSED') {
      throw new BadRequestException(
        'Can only complete RUNNING or PAUSED experiments'
      )
    }

    const updated = await this.prisma.experiment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
      include: { variants: true },
    })
    // Only RUNNING experiments are evaluated by the SDK
    if (experiment.status === 'RUNNING') {
      await this.recordExperimentChanged(experiment)
    }

    await this.auditLogs.create({
      action: 'experiment.completed',
      entityType: 'Experiment',
      entityId: id,
      userId,
      organizationId: experiment.organizationId,
      projectId: experiment.projectId,
    })

    return updated
  }

  /**
   * Records an evaluation change for the experiment's flag in its
   * environment. Only status changes from or to RUNNING matter: update,
   * delete and variant changes are restricted to DRAFT/PAUSED experiments,
   * which the SDK does not evaluate. Never throws.
   */
  private async recordExperimentChanged(experiment: {
    flagId: string
    environmentId: string
    projectId: string
    organizationId: string
  }) {
    let flagKey: string | undefined
    try {
      const flag = await this.prisma.featureFlag.findUnique({
        where: { id: experiment.flagId },
        select: { key: true },
      })
      flagKey = flag?.key
    } catch (error) {
      this.logger.warn(
        `Flag lookup for experiment change failed: ${String(error)}`
      )
    }
    void this.changes.recordChange({
      organizationId: experiment.organizationId,
      projectId: experiment.projectId,
      environmentIds: [experiment.environmentId],
      changes: [
        {
          ...(flagKey !== undefined && { flagKey }),
          action: 'experiment_changed',
        },
      ],
    })
  }

  // --- Variant CRUD ---

  async addVariant(experimentId: string, dto: CreateVariantDto) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only add variants to DRAFT experiments'
      )
    }

    return this.prisma.experimentVariant.create({
      data: {
        experiment: { connect: { id: experimentId } },
        key: dto.key,
        name: dto.name,
        description: dto.description,
        value: dto.value,
        weight: dto.weight,
        isControl: dto.isControl ?? false,
      },
    })
  }

  async updateVariant(
    experimentId: string,
    variantId: string,
    data: UpdateVariantDto
  ) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new BadRequestException(
        'Can only update variants in DRAFT or PAUSED experiments'
      )
    }

    if (!isObjectId(variantId)) throw new NotFoundException('Variant not found')

    const variant = await this.prisma.experimentVariant.findFirst({
      where: { id: variantId, experimentId },
    })
    if (!variant) throw new NotFoundException('Variant not found')

    return this.prisma.experimentVariant.update({
      where: { id: variantId },
      data: {
        key: data.key,
        name: data.name,
        description: data.description,
        value: data.value,
        weight: data.weight,
        isControl: data.isControl,
      },
    })
  }

  async deleteVariant(experimentId: string, variantId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
    })
    if (!experiment) throw new NotFoundException('Experiment not found')

    if (experiment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only delete variants from DRAFT experiments'
      )
    }

    if (!isObjectId(variantId)) throw new NotFoundException('Variant not found')

    const variant = await this.prisma.experimentVariant.findFirst({
      where: { id: variantId, experimentId },
    })
    if (!variant) throw new NotFoundException('Variant not found')

    await this.prisma.experimentVariant.delete({ where: { id: variantId } })
  }
}
