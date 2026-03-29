import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'
import {
  getDefaultFlagValue,
  isOriginAllowed,
  toSdkFlagResponse,
} from './sdk.helpers'
import { EvaluationService, ToggleContext } from './evaluation.service'
import { HashingService } from './hashing.service'

@Injectable()
export class SdkService {
  private readonly logger = new Logger(SdkService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: EvaluationService,
    private readonly hashingService: HashingService,
  ) {}

  private async validateApiKeyAndOrigin(
    apiKey: string,
    projectKey: string,
    origin?: string
  ): Promise<void> {
    this.logger.debug(
      `[SDK Service] Validating API key for project: ${projectKey}`
    )

    // Find API key
    const keyRecord = await this.prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
      },
      include: {
        organization: {
          include: {
            projects: {
              where: { key: projectKey },
            },
          },
        },
      },
    })

    if (!keyRecord) {
      this.logger.debug(`[SDK Service] ERROR: API key not found or inactive`)
      throw new UnauthorizedException('Invalid API key')
    }

    this.logger.debug(
      `[SDK Service] API key found, org: ${keyRecord.organizationId}`
    )

    // Check if key belongs to project's organization
    const project = keyRecord.organization.projects[0]
    if (!project) {
      this.logger.debug(
        `[SDK Service] ERROR: Project ${projectKey} not found in organization`
      )
      throw new UnauthorizedException(
        'API key does not have access to this project'
      )
    }

    this.logger.debug(
      `[SDK Service] Project found: ${project.id}, allowedOrigins:`,
      project.allowedOrigins
    )

    // Check origin if project has allowedOrigins
    if (origin && project.allowedOrigins && project.allowedOrigins.length > 0) {
      const allowed = isOriginAllowed(origin, project.allowedOrigins)

      if (!allowed) {
        this.logger.debug(
          `[SDK Service] ERROR: Origin ${origin} not in allowedOrigins`
        )
        throw new ForbiddenException('Origin not allowed')
      }
      this.logger.debug(`[SDK Service] Origin ${origin} allowed`)
    }
  }

  async evaluateFlag(
    projectKey: string,
    environmentKey: string,
    flagKey: string,
    apiKey: string,
    brandKey?: string,
    origin?: string,
    context: ToggleContext = {}
  ) {
    this.logger.debug(
      `[SDK Service] evaluateFlag: ${flagKey} for ${projectKey}/${environmentKey}`
    )

    // Validate API key first
    await this.validateApiKeyAndOrigin(apiKey, projectKey, origin)

    // Find project by key (need orgId, so we search)
    const project = await this.prisma.project.findFirst({
      where: { key: projectKey },
    })

    if (!project) {
      this.logger.debug(`[SDK Service] ERROR: Project ${projectKey} not found`)
      throw new NotFoundException('Project not found')
    }
    this.logger.debug(`[SDK Service] Project found: ${project.id}`)

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    })

    if (!environment) {
      this.logger.debug(
        `[SDK Service] ERROR: Environment ${environmentKey} not found`
      )
      throw new NotFoundException('Environment not found')
    }
    this.logger.debug(`[SDK Service] Environment found: ${environment.id}`)

    const flag = await this.prisma.featureFlag.findFirst({
      where: { projectId: project.id, key: flagKey },
    })

    if (!flag) {
      this.logger.debug(
        `[SDK Service] WARNING: Flag ${flagKey} not found, returning disabled`
      )
      return { value: false, enabled: false, flagType: 'BOOLEAN' }
    }
    this.logger.debug(
      `[SDK Service] Flag found: ${flag.id}, type: ${flag.flagType}`
    )

    let brandId: string | null = null
    if (brandKey && project.type === 'MULTI') {
      // Try to find by key first, then by id (in case brandKey is actually an id)
      let brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, key: brandKey },
      })

      // If not found by key, try by id
      if (!brand) {
        brand = await this.prisma.brand.findFirst({
          where: { projectId: project.id, id: brandKey },
        })
      }

      if (brand) {
        brandId = brand.id
        this.logger.debug(
          `[SDK Service] Brand found: ${brand.id} (key: ${brand.key})`
        )
      } else {
        this.logger.debug(
          `[SDK Service] Brand not found for key/id: ${brandKey}`
        )
      }
    }

    // Find or create flag environment with targeting rules
    let flagEnv = await this.prisma.flagEnvironment.findFirst({
      where: {
        flagId: flag.id,
        environmentId: environment.id,
        brandId: brandId || null,
      },
      include: {
        targetingRules: {
          include: { conditions: true },
          orderBy: { priority: 'asc' },
        },
      },
    })

    // Auto-create if missing
    if (!flagEnv) {
      this.logger.debug(
        `[SDK Service] FlagEnvironment not found, auto-creating with disabled state`
      )
      const created = await this.prisma.flagEnvironment.create({
        data: {
          flagId: flag.id,
          environmentId: environment.id,
          brandId: brandId || null,
          enabled: false,
          defaultValue: getDefaultFlagValue(flag.flagType),
        },
        include: {
          targetingRules: {
            include: { conditions: true },
            orderBy: { priority: 'asc' },
          },
        },
      })
      flagEnv = created
    }

    this.logger.debug(
      `[SDK Service] FlagEnvironment: enabled=${flagEnv.enabled}, value=${flagEnv.defaultValue}, rules=${flagEnv.targetingRules.length}`
    )

    // Evaluate: Experiment -> TargetingRules -> Default
    let resolvedValue = flagEnv.defaultValue
    let experimentInfo: { key: string; variantKey: string } | undefined

    if (flagEnv.enabled) {
      // Check for active experiment
      const expResult = await this.tryExperimentEvaluation(
        flag.id,
        environment.id,
        context,
      )
      if (expResult) {
        resolvedValue = expResult.value
        experimentInfo = { key: expResult.experimentKey, variantKey: expResult.variantKey }
        this.logger.debug(
          `[SDK Service] Experiment matched: ${expResult.experimentKey}, variant: ${expResult.variantKey}`
        )
      } else if (flagEnv.targetingRules.length > 0) {
        // Evaluate targeting rules
        const ruleResult = this.evaluationService.evaluateRules(
          flagEnv.targetingRules,
          context,
        )
        if (ruleResult !== null) {
          resolvedValue = ruleResult
          this.logger.debug(
            `[SDK Service] Rule matched, serving value: ${resolvedValue}`
          )
        }
      }
    }

    const response = toSdkFlagResponse(
      flag,
      project.organizationId,
      resolvedValue,
      flagEnv.enabled
    )

    if (experimentInfo) {
      (response as any).experiment = experimentInfo
    }

    return response
  }

  async evaluateAllFlags(
    projectKey: string,
    environmentKey: string,
    brandKey?: string,
    context: ToggleContext = {}
  ) {
    // Find project by key
    const project = await this.prisma.project.findFirst({
      where: { key: projectKey },
    })

    if (!project) throw new NotFoundException('Project not found')

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    })

    if (!environment) throw new NotFoundException('Environment not found')

    // Get all flags for project
    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId: project.id },
    })

    let brandId: string | null = null
    if (brandKey && project.type === 'MULTI') {
      const brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, key: brandKey },
      })
      if (brand) {
        brandId = brand.id
      }
    }

    // Get all flag environments for this environment and brand, including targeting rules
    const flagEnvs = await this.prisma.flagEnvironment.findMany({
      where: {
        environmentId: environment.id,
        OR: [{ brandId: brandId }, { brandId: null }],
      },
      include: {
        targetingRules: {
          include: { conditions: true },
          orderBy: { priority: 'asc' },
        },
      },
    })

    const results: Record<string, any> = {}

    this.logger.debug(
      `[SDK getAllFlags] Processing ${flags.length} flags, brandId: ${brandId}, envId: ${environment.id}`
    )

    for (const flag of flags) {
      // Find matching flag environment for this brand
      let flagEnv = flagEnvs.find(
        (fe) => fe.flagId === flag.id && fe.brandId === brandId
      )

      // If we are in a MULTI project but no brand-specific env exists yet,
      // check if a global (null brand) one exists to inherit from, or create brand-specific
      if (!flagEnv && brandId) {
        const globalEnv = flagEnvs.find(
          (fe) => fe.flagId === flag.id && !fe.brandId
        )

        const created = await this.prisma.flagEnvironment.create({
          data: {
            flagId: flag.id,
            environmentId: environment.id,
            brandId: brandId,
            enabled: globalEnv?.enabled ?? false,
            defaultValue:
              globalEnv?.defaultValue ?? getDefaultFlagValue(flag.flagType),
          },
          include: {
            targetingRules: {
              include: { conditions: true },
              orderBy: { priority: 'asc' },
            },
          },
        })
        flagEnv = created
      } else if (!flagEnv && !brandId) {
        const created = await this.prisma.flagEnvironment.create({
          data: {
            flagId: flag.id,
            environmentId: environment.id,
            brandId: null,
            enabled: false,
            defaultValue: getDefaultFlagValue(flag.flagType),
          },
          include: {
            targetingRules: {
              include: { conditions: true },
              orderBy: { priority: 'asc' },
            },
          },
        })
        flagEnv = created
      }

      if (flagEnv) {
        let resolvedValue = flagEnv.defaultValue
        let experimentInfo: { key: string; variantKey: string } | undefined

        if (flagEnv.enabled) {
          const expResult = await this.tryExperimentEvaluation(
            flag.id,
            environment.id,
            context,
          )
          if (expResult) {
            resolvedValue = expResult.value
            experimentInfo = { key: expResult.experimentKey, variantKey: expResult.variantKey }
          } else if (flagEnv.targetingRules.length > 0) {
            const ruleResult = this.evaluationService.evaluateRules(
              flagEnv.targetingRules,
              context,
            )
            if (ruleResult !== null) {
              resolvedValue = ruleResult
            }
          }
        }

        const response = toSdkFlagResponse(
          flag,
          project.organizationId,
          resolvedValue,
          flagEnv.enabled
        )

        if (experimentInfo) {
          (response as any).experiment = experimentInfo
        }

        results[flag.key] = response
      }
    }

    return results
  }

  async getAllFlags(
    projectKey: string,
    environmentKey: string,
    apiKey: string,
    brandKey?: string,
    origin?: string,
    context: ToggleContext = {}
  ): Promise<Record<string, any>> {
    // Validate API key first
    await this.validateApiKeyAndOrigin(apiKey, projectKey, origin)

    return this.evaluateAllFlags(projectKey, environmentKey, brandKey, context)
  }

  private async tryExperimentEvaluation(
    flagId: string,
    environmentId: string,
    context: ToggleContext,
  ): Promise<{ value: string; experimentKey: string; variantKey: string } | null> {
    if (!context.userId) return null

    const experiment = await this.prisma.experiment.findFirst({
      where: {
        flagId,
        environmentId,
        status: 'RUNNING',
      },
      include: { variants: true },
    })

    if (!experiment || experiment.variants.length === 0) return null

    const userId = String(context.userId)

    // Check traffic allocation
    if (!this.hashingService.isInTraffic(experiment.id, userId, experiment.trafficPercent)) {
      return null
    }

    // Assign variant
    const variant = this.hashingService.assignVariant(
      experiment.id,
      userId,
      experiment.variants,
    )

    if (!variant) return null

    // Track exposure asynchronously (fire-and-forget)
    this.prisma.experimentEvent.create({
      data: {
        experimentId: experiment.id,
        variantId: variant.id,
        type: 'EXPOSURE',
        userId,
      },
    }).catch((err) => {
      this.logger.error('[SDK Service] Failed to track exposure:', err)
    })

    return {
      value: variant.value,
      experimentKey: experiment.key,
      variantKey: variant.key,
    }
  }

  async validateApiKey(apiKey: string, projectKey: string): Promise<boolean> {
    // API keys are stored with their full value or hash
    // Check if the provided key matches any active key for this project
    const keys = await this.prisma.apiKey.findMany({
      where: {
        isActive: true,
      },
      include: {
        organization: {
          include: {
            projects: {
              where: { key: projectKey },
            },
          },
        },
      },
    })

    // Check if any active key matches the provided key
    return keys.some((k) => k.key === apiKey)
  }
}
