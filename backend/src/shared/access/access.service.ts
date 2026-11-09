import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'
import { PrismaService } from '../prisma.service'

const ROLE_RANK: Record<OrganizationRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/** Returns true if the value is a syntactically valid MongoDB ObjectId. */
export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value)
}

/** Returns true if `role` is at least as privileged as `minRole`. */
export function hasRole(role: OrganizationRole, minRole: OrganizationRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/**
 * Central tenant-isolation checks. Every endpoint that touches
 * organization-scoped data must resolve the resource through one of these
 * methods before reading or mutating it.
 *
 * Non-members get a 404 (not 403) so that resource ids of other tenants
 * cannot be probed.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Asserts that the user is a member of the org with at least `minRole`. */
  async assertOrgRole(
    userId: string,
    organizationId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    if (!isObjectId(organizationId) || !isObjectId(userId)) {
      throw new NotFoundException('Organization not found')
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId },
    })

    if (!membership) {
      throw new NotFoundException('Organization not found')
    }

    if (!hasRole(membership.role, minRole)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return membership
  }

  async assertProjectAccess(
    userId: string,
    projectId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    const project = isObjectId(projectId)
      ? await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, organizationId: true },
        })
      : null
    if (!project) throw new NotFoundException('Project not found')

    const membership = await this.assertOrgRole(
      userId,
      project.organizationId,
      minRole
    )
    return { project, membership }
  }

  async assertFlagAccess(
    userId: string,
    flagId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    const flag = isObjectId(flagId)
      ? await this.prisma.featureFlag.findUnique({
          where: { id: flagId },
          select: {
            id: true,
            key: true,
            projectId: true,
            organizationId: true,
          },
        })
      : null
    if (!flag) throw new NotFoundException('Feature flag not found')

    const { project, membership } = await this.assertProjectAccess(
      userId,
      flag.projectId,
      minRole
    )
    return { flag, project, membership }
  }

  async assertEnvironmentAccess(
    userId: string,
    environmentId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    const environment = isObjectId(environmentId)
      ? await this.prisma.environment.findUnique({
          where: { id: environmentId },
          select: { id: true, projectId: true },
        })
      : null
    if (!environment) throw new NotFoundException('Environment not found')

    const { project, membership } = await this.assertProjectAccess(
      userId,
      environment.projectId,
      minRole
    )
    return { environment, project, membership }
  }

  async assertBrandAccess(
    userId: string,
    brandId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    const brand = isObjectId(brandId)
      ? await this.prisma.brand.findUnique({
          where: { id: brandId },
          select: { id: true, projectId: true },
        })
      : null
    if (!brand) throw new NotFoundException('Brand not found')

    const { project, membership } = await this.assertProjectAccess(
      userId,
      brand.projectId,
      minRole
    )
    return { brand, project, membership }
  }

  async assertExperimentAccess(
    userId: string,
    experimentId: string,
    minRole: OrganizationRole = 'VIEWER'
  ) {
    const experiment = isObjectId(experimentId)
      ? await this.prisma.experiment.findUnique({
          where: { id: experimentId },
          select: { id: true, projectId: true, organizationId: true },
        })
      : null
    if (!experiment) throw new NotFoundException('Experiment not found')

    const { project, membership } = await this.assertProjectAccess(
      userId,
      experiment.projectId,
      minRole
    )
    return { experiment, project, membership }
  }

  async assertApiKeyAccess(
    userId: string,
    apiKeyId: string,
    minRole: OrganizationRole = 'ADMIN'
  ) {
    const apiKey = isObjectId(apiKeyId)
      ? await this.prisma.apiKey.findUnique({
          where: { id: apiKeyId },
          select: { id: true, organizationId: true },
        })
      : null
    if (!apiKey) throw new NotFoundException('API key not found')

    const membership = await this.assertOrgRole(
      userId,
      apiKey.organizationId,
      minRole
    )
    return { apiKey, membership }
  }

  /**
   * Asserts that an environment belongs to the given project. Used to prevent
   * linking resources of one project/tenant to environments of another.
   */
  async assertEnvironmentInProject(environmentId: string, projectId: string) {
    const environment = isObjectId(environmentId)
      ? await this.prisma.environment.findFirst({
          where: { id: environmentId, projectId },
          select: { id: true },
        })
      : null
    if (!environment) throw new NotFoundException('Environment not found')
    return environment
  }

  /** Asserts that a brand belongs to the given project. */
  async assertBrandInProject(brandId: string, projectId: string) {
    const brand = isObjectId(brandId)
      ? await this.prisma.brand.findFirst({
          where: { id: brandId, projectId },
          select: { id: true },
        })
      : null
    if (!brand) throw new NotFoundException('Brand not found')
    return brand
  }
}
