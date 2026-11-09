import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Environment, Project } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import {
  getDefaultFlagValue,
  isOriginAllowed,
  toSdkFlagResponse,
} from './sdk.helpers'
import { EvaluationService, ToggleContext } from './evaluation.service'
import { HashingService } from './hashing.service'

/** Upper bound for SDK-supplied identifiers (api key, project/env/brand keys). */
const MAX_SDK_IDENTIFIER_LENGTH = 256
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

export interface SdkAccess {
  organizationId: string
  apiKeyId: string
  project: Project
  environment: Environment
}

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SDK_IDENTIFIER_LENGTH
  )
}

@Injectable()
export class SdkService {
  private readonly logger = new Logger(SdkService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: EvaluationService,
    private readonly hashingService: HashingService
  ) {}

  /**
   * Authenticate an SDK request and resolve the project and environment it
   * targets. All lookups are scoped to the API key's organization, so a
   * project key that also exists in another organization can never be
   * resolved through this key.
   *
   * Throws UnauthorizedException (invalid/expired key, project not in the
   * key's organization or key bound to another environment),
   * ForbiddenException (origin not allowed) or NotFoundException
   * (environment not found).
   */
  async resolveSdkAccess(
    projectKey: string,
    environmentKey: string,
    apiKey: string,
    origin?: string
  ): Promise<SdkAccess> {
    if (!isValidIdentifier(apiKey)) {
      throw new UnauthorizedException('Invalid API key')
    }
    if (!isValidIdentifier(projectKey)) {
      throw new UnauthorizedException(
        'API key does not have access to this project'
      )
    }
    if (!isValidIdentifier(environmentKey)) {
      throw new NotFoundException('Environment not found')
    }

    this.logger.debug(
      `[SDK Service] Validating API key for project: ${projectKey}`
    )

    const keyRecord = await this.prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { isSet: false } },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { id: true, organizationId: true, environmentId: true },
    })

    if (!keyRecord) {
      this.logger.debug(
        `[SDK Service] ERROR: API key not found, inactive or expired`
      )
      throw new UnauthorizedException('Invalid API key')
    }

    const project = await this.prisma.project.findFirst({
      where: { organizationId: keyRecord.organizationId, key: projectKey },
    })

    if (!project) {
      this.logger.debug(
        `[SDK Service] ERROR: Project ${projectKey} not found in organization`
      )
      throw new UnauthorizedException(
        'API key does not have access to this project'
      )
    }

    // Check origin if project has allowedOrigins
    if (origin && project.allowedOrigins && project.allowedOrigins.length > 0) {
      if (!isOriginAllowed(origin, project.allowedOrigins)) {
        this.logger.debug(
          `[SDK Service] ERROR: Origin ${origin} not in allowedOrigins`
        )
        throw new ForbiddenException('Origin not allowed')
      }
    }

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    })

    if (!environment) {
      this.logger.debug(
        `[SDK Service] ERROR: Environment ${environmentKey} not found`
      )
      throw new NotFoundException('Environment not found')
    }

    if (keyRecord.environmentId && keyRecord.environmentId !== environment.id) {
      this.logger.debug(
        `[SDK Service] ERROR: API key is bound to another environment`
      )
      throw new UnauthorizedException(
        'API key does not have access to this environment'
      )
    }

    return {
      organizationId: keyRecord.organizationId,
      apiKeyId: keyRecord.id,
      project,
      environment,
    }
  }

  /**
   * Resolve a brand of the given project by key, or by id when the value is a
   * valid ObjectId. Anything else is treated as "not found".
   */
  private async resolveBrandId(
    project: Project,
    brandKey?: string
  ): Promise<string | null> {
    if (!brandKey || project.type !== 'MULTI') return null
    if (!isValidIdentifier(brandKey)) return null

    let brand = await this.prisma.brand.findFirst({
      where: { projectId: project.id, key: brandKey },
    })

    // Fall back to id lookup only for well-formed ObjectIds, so arbitrary
    // input never reaches Prisma as an ObjectId (which would throw).
    if (!brand && OBJECT_ID_PATTERN.test(brandKey)) {
      brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, id: brandKey },
      })
    }

    if (!brand) {
      this.logger.debug(`[SDK Service] Brand not found for key/id: ${brandKey}`)
      return null
    }
    return brand.id
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

    const { project, environment } = await this.resolveSdkAccess(
      projectKey,
      environmentKey,
      apiKey,
      origin
    )

    if (!isValidIdentifier(flagKey)) {
      return { value: false, enabled: false, flagType: 'BOOLEAN' }
    }

    const flag = await this.prisma.featureFlag.findFirst({
      where: { projectId: project.id, key: flagKey },
    })

    if (!flag) {
      this.logger.debug(
        `[SDK Service] WARNING: Flag ${flagKey} not found, returning disabled`
      )
      return { value: false, enabled: false, flagType: 'BOOLEAN' }
    }

    const brandId = await this.resolveBrandId(project, brandKey)

    const include = {
      targetingRules: {
        include: { conditions: true },
        orderBy: { priority: 'asc' as const },
      },
    }

    // A brand override (own row) wins; without one the brand inherits the
    // environment default live. Reads never create brand rows.
    const brandEnv = brandId
      ? await this.prisma.flagEnvironment.findFirst({
          where: { flagId: flag.id, environmentId: environment.id, brandId },
          include,
        })
      : null

    let defaultEnv =
      brandEnv && brandEnv.targetingRules.length > 0
        ? null
        : await this.prisma.flagEnvironment.findFirst({
            where: {
              flagId: flag.id,
              environmentId: environment.id,
              brandId: null,
            },
            include,
          })

    // Only the environment default is ever auto-created on read
    if (!brandEnv && !defaultEnv) {
      this.logger.debug(
        `[SDK Service] Default FlagEnvironment not found, auto-creating with disabled state`
      )
      defaultEnv = await this.prisma.flagEnvironment.create({
        data: {
          flagId: flag.id,
          environmentId: environment.id,
          brandId: null,
          enabled: false,
          defaultValue: getDefaultFlagValue(flag.flagType),
        },
        include,
      })
    }

    const flagEnv = (brandEnv ?? defaultEnv) as NonNullable<typeof defaultEnv>
    // Brand overrides inherit the environment-level rules unless they define
    // their own
    const rules =
      brandEnv && brandEnv.targetingRules.length > 0
        ? brandEnv.targetingRules
        : (defaultEnv?.targetingRules ?? [])

    this.logger.debug(
      `[SDK Service] FlagEnvironment: enabled=${flagEnv.enabled}, value=${flagEnv.defaultValue}, rules=${rules.length}, inherited=${!!brandId && !brandEnv}`
    )

    // Evaluate: Experiment -> TargetingRules -> Default
    let resolvedValue = flagEnv.defaultValue
    let experimentInfo: { key: string; variantKey: string } | undefined

    if (flagEnv.enabled) {
      // Check for active experiment
      const expResult = await this.tryExperimentEvaluation(
        flag.id,
        environment.id,
        context
      )
      if (expResult) {
        resolvedValue = expResult.value
        experimentInfo = {
          key: expResult.experimentKey,
          variantKey: expResult.variantKey,
        }
        this.logger.debug(
          `[SDK Service] Experiment matched: ${expResult.experimentKey}, variant: ${expResult.variantKey}`
        )
      } else {
        const ruleResult = this.evaluationService.evaluateRules(rules, context)
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
      ;(response as any).experiment = experimentInfo
    }

    return response
  }

  private async evaluateAllFlagsForAccess(
    project: Project,
    environment: Environment,
    brandKey?: string,
    context: ToggleContext = {}
  ) {
    // Get all flags for project
    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId: project.id },
    })

    const brandId = await this.resolveBrandId(project, brandKey)

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
      // A brand override (own row) wins; otherwise the brand inherits the
      // environment default live. Reads never create brand rows.
      const brandEnv = brandId
        ? flagEnvs.find((fe) => fe.flagId === flag.id && fe.brandId === brandId)
        : undefined
      let defaultEnv = flagEnvs.find(
        (fe) => fe.flagId === flag.id && !fe.brandId
      )

      // Only the environment default is ever auto-created on read
      if (!brandEnv && !defaultEnv) {
        defaultEnv = await this.prisma.flagEnvironment.create({
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
      }

      const flagEnv = brandEnv ?? defaultEnv
      if (flagEnv) {
        let resolvedValue = flagEnv.defaultValue
        let experimentInfo: { key: string; variantKey: string } | undefined

        if (flagEnv.enabled) {
          const expResult = await this.tryExperimentEvaluation(
            flag.id,
            environment.id,
            context
          )
          if (expResult) {
            resolvedValue = expResult.value
            experimentInfo = {
              key: expResult.experimentKey,
              variantKey: expResult.variantKey,
            }
          } else {
            // Brand overrides inherit environment-level rules unless they
            // define their own
            const rules =
              brandEnv && brandEnv.targetingRules.length > 0
                ? brandEnv.targetingRules
                : (defaultEnv?.targetingRules ?? [])
            const ruleResult = this.evaluationService.evaluateRules(
              rules,
              context
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
          ;(response as any).experiment = experimentInfo
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
    const { project, environment } = await this.resolveSdkAccess(
      projectKey,
      environmentKey,
      apiKey,
      origin
    )

    return this.evaluateAllFlagsForAccess(
      project,
      environment,
      brandKey,
      context
    )
  }

  private async tryExperimentEvaluation(
    flagId: string,
    environmentId: string,
    context: ToggleContext
  ): Promise<{
    value: string
    experimentKey: string
    variantKey: string
  } | null> {
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
    if (
      !this.hashingService.isInTraffic(
        experiment.id,
        userId,
        experiment.trafficPercent
      )
    ) {
      return null
    }

    // Assign variant
    const variant = this.hashingService.assignVariant(
      experiment.id,
      userId,
      experiment.variants
    )

    if (!variant) return null

    // Track exposure asynchronously (fire-and-forget)
    this.prisma.experimentEvent
      .create({
        data: {
          experiment: { connect: { id: experiment.id } },
          variant: { connect: { id: variant.id } },
          type: 'EXPOSURE',
          userId,
        },
      })
      .catch((err) => {
        this.logger.error('[SDK Service] Failed to track exposure:', err)
      })

    return {
      value: variant.value,
      experimentKey: experiment.key,
      variantKey: variant.key,
    }
  }
}
