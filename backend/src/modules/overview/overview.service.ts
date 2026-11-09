import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'

/** Number of entries in "recently changed flags". */
export const RECENT_FLAGS_LIMIT = 10

/** Environment key that counts as production for "enabled in production". */
export const PRODUCTION_ENVIRONMENT_KEY = 'production'

export interface OverviewCounts {
  organizations: number
  projects: number
  flags: number
  /** Flags enabled in a `production` environment; null when no project has one. */
  flagsEnabledInProduction: number | null
  runningExperiments: number
}

export interface OverviewProject {
  id: string
  name: string
  key: string
  type: string
  organizationId: string
  organizationName: string
  flagCount: number
  environmentCount: number
  updatedAt: Date
}

export interface OverviewRecentFlag {
  id: string
  projectId: string
  key: string
  name: string
  flagType: string
  updatedAt: Date
}

export interface Overview {
  counts: OverviewCounts
  recentFlags: OverviewRecentFlag[]
  projects: OverviewProject[]
}

/**
 * Dashboard data across all organizations the user is a member of. Every
 * query is scoped to the ids derived from the caller's memberships, so other
 * tenants' data is never read.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string): Promise<Overview> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: {
        organizationId: true,
        organization: { select: { id: true, name: true } },
      },
    })
    const orgNames = new Map(
      memberships.map((m) => [m.organizationId, m.organization?.name ?? ''])
    )
    const counts: OverviewCounts = {
      organizations: orgNames.size,
      projects: 0,
      flags: 0,
      flagsEnabledInProduction: null,
      runningExperiments: 0,
    }
    if (orgNames.size === 0) return { counts, recentFlags: [], projects: [] }

    const projectRows = await this.prisma.project.findMany({
      where: { organizationId: { in: [...orgNames.keys()] } },
      select: {
        id: true,
        name: true,
        key: true,
        type: true,
        organizationId: true,
        updatedAt: true,
        _count: { select: { featureFlags: true, environments: true } },
      },
      orderBy: { name: 'asc' },
    })
    const projects: OverviewProject[] = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      key: p.key,
      type: p.type,
      organizationId: p.organizationId,
      organizationName: orgNames.get(p.organizationId) ?? '',
      flagCount: p._count.featureFlags,
      environmentCount: p._count.environments,
      updatedAt: p.updatedAt,
    }))
    counts.projects = projects.length
    if (projects.length === 0) return { counts, recentFlags: [], projects }

    const projectId = { in: projects.map((p) => p.id) }
    const [flagIds, runningExperiments, productionEnvs, recentFlags] =
      await Promise.all([
        this.prisma.featureFlag.findMany({
          where: { projectId },
          select: { id: true },
        }),
        this.prisma.experiment.count({
          where: { projectId, status: 'RUNNING' },
        }),
        this.prisma.environment.findMany({
          where: { projectId, key: PRODUCTION_ENVIRONMENT_KEY },
          select: { id: true },
        }),
        this.prisma.featureFlag.findMany({
          where: { projectId },
          orderBy: { updatedAt: 'desc' },
          take: RECENT_FLAGS_LIMIT,
          select: {
            id: true,
            projectId: true,
            key: true,
            name: true,
            flagType: true,
            updatedAt: true,
          },
        }),
      ])

    counts.flags = flagIds.length
    counts.runningExperiments = runningExperiments
    if (productionEnvs.length > 0) {
      // Only the environment default (brandId null) says whether a flag is
      // on in production; brand overrides and rows of deleted flags do not.
      const enabled = await this.prisma.flagEnvironment.findMany({
        where: {
          flagId: { in: flagIds.map((f) => f.id) },
          environmentId: { in: productionEnvs.map((e) => e.id) },
          brandId: null,
          enabled: true,
        },
        select: { flagId: true },
      })
      counts.flagsEnabledInProduction = new Set(
        enabled.map((row) => row.flagId)
      ).size
    }

    return { counts, recentFlags, projects }
  }
}
