import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { Project } from '../../domain/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { getDefaultFlagValue } from '../sdk/sdk.helpers';
import { isPrismaUniqueConstraintError } from '../../shared/prisma-errors';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { include: { projects: { include: { environments: true } } } } },
    });
    
    const projects = memberships.flatMap(m => m.organization.projects);
    
    // Get counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (p) => {
        const flagCount = await this.prisma.featureFlag.count({
          where: { projectId: p.id },
        });

        return {
          id: p.id,
          name: p.name,
          key: p.key,
          description: p.description,
          type: p.type,
          allowedOrigins: p.allowedOrigins,
          organizationId: p.organizationId,
          environments: p.environments,
          environmentCount: p.environments.length,
          flagCount,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      })
    );

    return projectsWithCounts;
  }

  async findOne(projectId: string) {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });
    
    if (!p) throw new NotFoundException('Project not found');
    
    const flagCount = await this.prisma.featureFlag.count({
      where: { projectId },
    });
    
    return {
      id: p.id,
      name: p.name,
      key: p.key,
      description: p.description,
      type: p.type,
      allowedOrigins: p.allowedOrigins,
      organizationId: p.organizationId,
      environments: p.environments,
      environmentCount: p.environments.length,
      flagCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async getEnvironments(projectId: string) {
    const envs = await this.prisma.environment.findMany({
      where: { projectId },
    });
    return envs;
  }

  async getFlagsWithBrands(projectId: string) {
    // Get project with environments
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });
    
    if (!project) throw new NotFoundException('Project not found');

    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
    });

    const brands = await this.prisma.brand.findMany({
      where: { projectId },
    });

    // Ensure all flags have default environments
    for (const flag of flags) {
      const existingEnvIds = new Set(
        flag.flagEnvironments
          .filter(fe => !fe.brandId)
          .map(fe => fe.environmentId)
      );
      
      const missingEnvs = project.environments.filter(
        env => !existingEnvIds.has(env.id)
      );
      
      for (const env of missingEnvs) {
        try {
          await this.prisma.flagEnvironment.create({
            data: {
              flagId: flag.id,
              environmentId: env.id,
              brandId: null,
              enabled: false,
              defaultValue: getDefaultFlagValue(flag.flagType),
            },
          });
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) throw error;
        }
      }
    }

    // Reload flags with created environments
    const flagsWithEnvs = await this.prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
    });

    const result = flagsWithEnvs.map(f => {
      const envs = f.flagEnvironments.filter(fe => !fe.brandId);
      
      return {
        id: f.id,
        name: f.name,
        key: f.key,
        flagType: f.flagType,
        environments: envs.map(env => ({
          id: env.id,
          environmentId: env.environmentId,
          environmentName: env.environment.name,
          enabled: env.enabled,
          defaultValue: env.defaultValue,
          brandValues: brands.map(b => {
            const brandEnv = f.flagEnvironments.find(
              fe => fe.environmentId === env.environmentId && fe.brandId === b.id
            );
            // Always return brand, using default env values if no override exists
            return {
              brandId: b.id,
              brandName: b.name,
              enabled: brandEnv?.enabled ?? env.enabled,
              value: brandEnv?.defaultValue ?? env.defaultValue,
              isOverride: !!brandEnv,
            };
          }),
        })),
      };
    });

    return { flags: result };
  }

  async create(orgId: string, userId: string, dto: CreateProjectDto): Promise<Project> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: orgId, role: { in: ['OWNER', 'ADMIN'] } },
    });
    
    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    const normalizedKey = dto.key.trim().toLowerCase();
    
    const existing = await this.prisma.project.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: normalizedKey } },
    });
    
    if (existing) {
      throw new ConflictException(`Project with key '${normalizedKey}' already exists`);
    }

    const project = Project.create({
      name: dto.name,
      key: normalizedKey,
      description: dto.description || null,
      type: dto.type || 'SINGLE',
      allowedOrigins: dto.allowedOrigins || [],
      organizationId: orgId,
    });

    const created = await this.prisma.project.create({
      data: {
        id: project.id,
        name: project.name,
        key: project.key,
        description: project.description,
        type: project.type,
        allowedOrigins: project.allowedOrigins,
        organizationId: project.organizationId,
        environments: {
          create: [
            { name: 'Development', key: 'development', organizationId: orgId },
            { name: 'Production', key: 'production', organizationId: orgId },
          ],
        },
      },
    });

    return Project.reconstitute({
      id: created.id,
      name: project.name,
      key: project.key,
      description: project.description,
      type: project.type,
      allowedOrigins: project.allowedOrigins,
      organizationId: project.organizationId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }

  async update(projectId: string, data: { name?: string; description?: string; type?: 'SINGLE' | 'MULTI'; allowedOrigins?: string[] }) {
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data,
      include: { environments: true },
    });

    return {
      id: updated.id,
      name: updated.name,
      key: updated.key,
      description: updated.description,
      type: updated.type,
      allowedOrigins: updated.allowedOrigins,
      organizationId: updated.organizationId,
      environments: updated.environments,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async findByOrganization(orgId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      include: { environments: true },
    });
    
    // Get counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (p) => {
        const flagCount = await this.prisma.featureFlag.count({
          where: { projectId: p.id },
        });

        return {
          id: p.id,
          name: p.name,
          key: p.key,
          description: p.description,
          type: p.type,
          allowedOrigins: p.allowedOrigins,
          organizationId: p.organizationId,
          environments: p.environments,
          environmentCount: p.environments.length,
          flagCount,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      })
    );

    return projectsWithCounts;
  }

  async delete(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { 
        userId, 
        organizationId: project.organizationId, 
        role: { in: ['OWNER', 'ADMIN'] } 
      },
    });
    
    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    // Delete all dependent data first (cascading delete for MongoDB)
    // 1. Get all flags for this project
    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId },
      select: { id: true },
    });
    const flagIds = flags.map(f => f.id);

    // 2. Delete flag environments for all project flags
    if (flagIds.length > 0) {
      await this.prisma.flagEnvironment.deleteMany({
        where: { flagId: { in: flagIds } },
      });
    }

    // 3. Delete flag environments for project environments (brand-specific)
    const envs = await this.prisma.environment.findMany({
      where: { projectId },
      select: { id: true },
    });
    const envIds = envs.map(e => e.id);
    if (envIds.length > 0) {
      await this.prisma.flagEnvironment.deleteMany({
        where: { environmentId: { in: envIds } },
      });
    }

    // 4. Delete feature flags
    await this.prisma.featureFlag.deleteMany({ where: { projectId } });

    // 5. Delete brands
    await this.prisma.brand.deleteMany({ where: { projectId } });

    // 6. Delete environments
    await this.prisma.environment.deleteMany({ where: { projectId } });

    // 7. Delete audit logs
    await this.prisma.auditLog.deleteMany({ where: { projectId } });

    // 8. Finally delete the project
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  // Import/Export Feature Flags
  async exportFlags(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
    });

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      projectName: project.name,
      projectKey: project.key,
      environments: project.environments.map(e => ({
        id: e.id,
        name: e.name,
        key: e.key,
      })),
      flags: flags.map(f => ({
        key: f.key,
        name: f.name,
        description: f.description,
        flagType: f.flagType,
        environments: f.flagEnvironments
          .filter(fe => !fe.brandId)
          .map(fe => ({
            environmentKey: fe.environment.key,
            enabled: fe.enabled,
            defaultValue: fe.defaultValue,
          })),
      })),
    };

    return exportData;
  }

  async importFlags(
    projectId: string,
    userId: string,
    flags: any[],
    options: { overwrite?: boolean; skipExisting?: boolean } = {}
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    // Check permissions
    const membership = await this.prisma.organizationMember.findFirst({
      where: { 
        userId, 
        organizationId: project.organizationId, 
        role: { in: ['OWNER', 'ADMIN'] } 
      },
    });
    
    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const flagData of flags) {
      try {
        // Check if flag already exists
        const existingFlag = await this.prisma.featureFlag.findFirst({
          where: { projectId, key: flagData.key.toLowerCase() },
        });

        if (existingFlag && options.skipExisting) {
          results.skipped++;
          continue;
        }

        // Create or update flag
        let flag;
        if (existingFlag && options.overwrite) {
          flag = await this.prisma.featureFlag.update({
            where: { id: existingFlag.id },
            data: {
              name: flagData.name,
              description: flagData.description,
              flagType: flagData.flagType,
              updatedById: userId,
            },
          });
        } else if (!existingFlag) {
          flag = await this.prisma.featureFlag.create({
            data: {
              key: flagData.key.toLowerCase(),
              name: flagData.name,
              description: flagData.description,
              flagType: flagData.flagType,
              projectId,
              organizationId: project.organizationId,
              createdById: userId,
            },
          });
        } else {
          results.skipped++;
          continue;
        }

        // Create/update flag environments
        for (const envData of flagData.environments || []) {
          const env = project.environments.find(e => e.key === envData.environmentKey);
          if (!env) {
            results.errors.push(`Environment '${envData.environmentKey}' not found for flag '${flagData.key}'`);
            continue;
          }

          const existingFlagEnv = await this.prisma.flagEnvironment.findFirst({
            where: { flagId: flag.id, environmentId: env.id, brandId: null },
          });

          if (existingFlagEnv) {
            await this.prisma.flagEnvironment.update({
              where: { id: existingFlagEnv.id },
              data: {
                enabled: envData.enabled,
                defaultValue: envData.defaultValue,
              },
            });
          } else {
            await this.prisma.flagEnvironment.create({
              data: {
                flagId: flag.id,
                environmentId: env.id,
                enabled: envData.enabled,
                defaultValue: envData.defaultValue,
              },
            });
          }
        }

        results.imported++;
      } catch (error: any) {
        results.errors.push(`Failed to import flag '${flagData.key}': ${error.message}`);
      }
    }

    return results;
  }
}
