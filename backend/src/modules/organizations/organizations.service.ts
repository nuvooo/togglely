import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class OrganizationsService {
  private static readonly allowedRoles = new Set<OrganizationRole>(['OWNER', 'ADMIN', 'MEMBER']);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
    });

    // Get counts for each organization
    const orgsWithCounts = await Promise.all(
      memberships.map(async (m) => {
        const [memberCount, projectCount] = await Promise.all([
          this.prisma.organizationMember.count({
            where: { organizationId: m.organizationId },
          }),
          this.prisma.project.count({
            where: { organizationId: m.organizationId },
          }),
        ]);

        return {
          ...m.organization,
          role: m.role,
          memberCount,
          projectCount,
        };
      })
    );

    return orgsWithCounts;
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async findByUser(userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      include: { organization: true },
    });

    if (!membership) return null;

    const [memberCount, projectCount] = await Promise.all([
      this.prisma.organizationMember.count({
        where: { organizationId: membership.organizationId },
      }),
      this.prisma.project.count({
        where: { organizationId: membership.organizationId },
      }),
    ]);

    return {
      ...membership.organization,
      role: membership.role,
      memberCount,
      projectCount,
    };
  }

  async getStats(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { include: { projects: true } } },
    });

    if (!memberships.length) {
      return { totalOrganizations: 0, totalProjects: 0, totalFlags: 0, totalEnabledFlags: 0 };
    }

    const allProjects = memberships.flatMap(m => m.organization.projects);
    const projectIds = allProjects.map(p => p.id);

    const flags = await this.prisma.featureFlag.count({
      where: { projectId: { in: projectIds } },
    });

    return {
      totalOrganizations: memberships.length,
      totalProjects: allProjects.length,
      totalFlags: flags,
      totalEnabledFlags: 0, // TODO: count enabled flags
    };
  }

  async create(name: string, slug: string | undefined, userId: string) {
    // Always use UUID as slug for uniqueness
    const finalSlug = slug || randomUUID();

    const org = await this.prisma.organization.create({
      data: {
        name,
        slug: finalSlug,
      },
    });

    await this.prisma.organizationMember.create({
      data: {
        userId,
        organizationId: org.id,
        role: 'OWNER',
      },
    });

    return org;
  }

  async update(id: string, data: { name?: string; description?: string }) {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    // Get all projects for this organization
    const projects = await this.prisma.project.findMany({
      where: { organizationId: id },
      select: { id: true },
    });

    // Delete each project with all its dependencies
    for (const project of projects) {
      const flags = await this.prisma.featureFlag.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      const flagIds = flags.map(f => f.id);

      // Delete flag environments
      if (flagIds.length > 0) {
        await this.prisma.flagEnvironment.deleteMany({
          where: { flagId: { in: flagIds } },
        });
      }

      const envs = await this.prisma.environment.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      const envIds = envs.map(e => e.id);
      if (envIds.length > 0) {
        await this.prisma.flagEnvironment.deleteMany({
          where: { environmentId: { in: envIds } },
        });
      }

      // Delete project data
      await this.prisma.featureFlag.deleteMany({ where: { projectId: project.id } });
      await this.prisma.brand.deleteMany({ where: { projectId: project.id } });
      await this.prisma.environment.deleteMany({ where: { projectId: project.id } });
      await this.prisma.auditLog.deleteMany({ where: { projectId: project.id } });
      await this.prisma.project.delete({ where: { id: project.id } });
    }

    // Delete organization-level data
    await this.prisma.auditLog.deleteMany({ where: { organizationId: id } });
    await this.prisma.apiKey.deleteMany({ where: { organizationId: id } });
    await this.prisma.environment.deleteMany({ where: { organizationId: id } });
    await this.prisma.featureFlag.deleteMany({ where: { organizationId: id } });
    await this.prisma.organizationMember.deleteMany({ where: { organizationId: id } });
    await this.prisma.organization.delete({ where: { id } });
  }

  async getMembers(orgId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    return members.map(m => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      name: `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() || m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async addMember(orgId: string, email: string, role: string) {
    // Check if organization exists
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: user.id },
    });

    if (existing) {
      throw new ConflictException('User is already a member');
    }

    return this.prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        role: this.parseOrganizationRole(role),
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  async removeMember(orgId: string, userId: string) {
    // Find the member first to ensure it exists
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId },
    });

    if (!member) {
      throw new NotFoundException('Member not found in organization');
    }

    // Delete by unique ID for MongoDB compatibility
    await this.prisma.organizationMember.delete({
      where: { id: member.id },
    });
  }

  private parseOrganizationRole(role: string): OrganizationRole {
    if (!OrganizationsService.allowedRoles.has(role as OrganizationRole)) {
      throw new BadRequestException(`Invalid organization role: ${role}`);
    }

    return role as OrganizationRole;
  }
}
