import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { Flag } from '../../domain/flag.entity';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagValueDto } from './dto/update-flag-value.dto';

@Injectable()
export class FlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, projectId?: string, environmentId?: string) {
    if (projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found');
      
      const membership = await this.prisma.organizationMember.findFirst({
        where: { userId, organizationId: project.organizationId },
      });
      if (!membership) throw new ForbiddenException('Access denied');
    }

    const where = projectId ? { projectId } : {};
    const flags = await this.prisma.featureFlag.findMany({ where });
    
    // If environmentId is provided, get the actual enabled status
    let flagEnvs: Map<string, { enabled: boolean; defaultValue: string; environmentId: string }> = new Map();
    if (projectId && environmentId) {
      const envs = await this.prisma.flagEnvironment.findMany({
        where: {
          flagId: { in: flags.map(f => f.id) },
          environmentId,
          brandId: null,
        },
      });
      envs.forEach(fe => {
        flagEnvs.set(fe.flagId, { 
          enabled: fe.enabled, 
          defaultValue: fe.defaultValue,
          environmentId: fe.environmentId 
        });
      });
    }
    
    return flags.map(f => {
      const flagEnv = flagEnvs.get(f.id);
      return {
        id: f.id,
        key: f.key,
        name: f.name,
        description: f.description,
        flagType: f.flagType,
        projectId: f.projectId,
        enabled: flagEnv?.enabled ?? false,
        defaultValue: flagEnv?.defaultValue,
        environmentId: flagEnv?.environmentId,
      };
    });
  }

  async findByProject(projectId: string) {
    // Get project environments first
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

    // Ensure all flags have environments (only non-brand ones)
    for (const flag of flags) {
      const existingEnvIds = new Set(
        flag.flagEnvironments
          .filter(fe => !fe.brandId) // Only non-brand environments
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
              defaultValue: flag.flagType === 'BOOLEAN' ? 'false' : 
                           flag.flagType === 'NUMBER' ? '0' : 
                           flag.flagType === 'JSON' ? '{}' : '',
            },
          });
        } catch (e) {
          // Ignore unique constraint errors
          if (e.code !== 'P2002') throw e;
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

    return flagsWithEnvs.map(f => ({
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
      environments: f.flagEnvironments
        .filter(fe => !fe.brandId) // Only return non-brand environments
        .map(fe => ({
          id: fe.id,
          environmentId: fe.environmentId,
          environmentName: fe.environment.name,
          enabled: fe.enabled,
          defaultValue: fe.defaultValue,
        })),
    }));
  }

  async findOne(flagId: string) {
    const f = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    });

    if (!f) throw new NotFoundException('Flag not found');

    return {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      flagType: f.flagType,
      projectId: f.projectId,
    };
  }

  async create(projectId: string, userId: string, dto: CreateFlagDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });
    
    if (!project) throw new NotFoundException('Project not found');

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: project.organizationId },
    });
    if (!membership) throw new ForbiddenException('Access denied');

    const normalizedKey = dto.key.trim().toLowerCase();
    
    const existing = await this.prisma.featureFlag.findFirst({
      where: { projectId, key: normalizedKey },
    });
    
    if (existing) {
      throw new ConflictException(`Flag with key '${normalizedKey}' already exists`);
    }

    const flag = Flag.create({
      key: normalizedKey,
      name: dto.name,
      description: dto.description || null,
      type: dto.type,
      projectId,
      organizationId: project.organizationId,
      createdById: userId,
    });

    const created = await this.prisma.featureFlag.create({
      data: {
        id: flag.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        flagType: flag.type,
        projectId: flag.projectId,
        organizationId: flag.organizationId,
        createdById: userId,
      },
    });

    const envs = await Promise.all(
      project.environments.map(env =>
        this.prisma.flagEnvironment.create({
          data: {
            flagId: created.id,
            environmentId: env.id,
            enabled: dto.initialValues?.[env.key]?.enabled ?? false,
            defaultValue: dto.initialValues?.[env.key]?.value ?? 'false',
          },
        })
      )
    );

    // Get environments with names for the response
    const envsWithNames = await this.prisma.flagEnvironment.findMany({
      where: { flagId: created.id, brandId: null },
      include: { environment: true },
    });

    return {
      featureFlag: {
        id: created.id,
        key: created.key,
        name: created.name,
        description: created.description,
        flagType: created.flagType,
        environments: envsWithNames.map(fe => ({
          id: fe.id,
          environmentId: fe.environmentId,
          environmentName: fe.environment.name,
          enabled: fe.enabled,
          defaultValue: fe.defaultValue,
        })),
      },
    };
  }

  async update(flagId: string, data: { name?: string; description?: string }) {
    const updated = await this.prisma.featureFlag.update({
      where: { id: flagId },
      data,
    });

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      type: updated.flagType,
      projectId: updated.projectId,
    };
  }

  async toggle(flagId: string, environmentId: string, enabled?: boolean) {
    // Try to find existing (checking both null and undefined for brandId)
    const allEnvs = await this.prisma.flagEnvironment.findMany({
      where: { flagId, environmentId },
    });
    const existing = allEnvs.find(fe => !fe.brandId);

    if (existing) {
      const newEnabled = enabled !== undefined ? enabled : !existing.enabled;
      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: { enabled: newEnabled },
      });
    }

    try {
      return await this.prisma.flagEnvironment.create({
        data: {
          flagId,
          environmentId,
          brandId: null,
          enabled: enabled ?? true,
          defaultValue: 'false',
        },
      });
    } catch (e: any) {
      // If unique constraint, try to find and update instead
      if (e.code === 'P2002') {
        const allEnvs = await this.prisma.flagEnvironment.findMany({
          where: { flagId, environmentId },
        });
        const found = allEnvs.find(fe => !fe.brandId);
        if (found) {
          return this.prisma.flagEnvironment.update({
            where: { id: found.id },
            data: { enabled: enabled ?? true },
          });
        }
      }
      throw e;
    }
  }

  async getEnvironments(flagId: string) {
    const envs = await this.prisma.flagEnvironment.findMany({
      where: { flagId, brandId: null },
      include: { environment: true },
    });

    return envs.map(fe => ({
      id: fe.environment.id,
      name: fe.environment.name,
      enabled: fe.enabled,
      defaultValue: fe.defaultValue,
    }));
  }

  async updateEnvironment(flagId: string, envId: string, data: { isEnabled?: boolean; defaultValue?: string }) {
    console.log(`[updateEnvironment] flagId: ${flagId}, envId: ${envId}, data:`, data);
    
    // Try 1: Find by flagEnvironment.id directly (most likely case)
    let existing = await this.prisma.flagEnvironment.findFirst({
      where: { id: envId },
    });
    console.log(`[updateEnvironment] Find by id=${envId}:`, existing ? `found (brandId=${existing.brandId})` : 'not found');

    // Try 2: Find by flagId + environmentId (for non-brand envs)
    if (!existing) {
      existing = await this.prisma.flagEnvironment.findFirst({
        where: { flagId, environmentId: envId, brandId: null },
      });
      console.log(`[updateEnvironment] Find by flagId+envId:`, existing ? 'found' : 'not found');
    }

    // Try 3: Find any flagEnv for this flag in this environment (regardless of brand)
    if (!existing) {
      const allEnvs = await this.prisma.flagEnvironment.findMany({
        where: { flagId },
        include: { environment: true },
      });
      console.log(`[updateEnvironment] All flagEnvs for flagId ${flagId}:`, allEnvs.map(e => ({ id: e.id, envId: e.environmentId, brandId: e.brandId })));
      
      // Find one matching the envId (either by environment.id or flagEnvironment.id)
      existing = allEnvs.find(fe => 
        fe.id === envId || fe.environmentId === envId
      );
    }

    if (existing) {
      console.log(`[updateEnvironment] Updating id=${existing.id} with:`, data);
      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: {
          enabled: data.isEnabled,
          defaultValue: data.defaultValue,
        },
      });
    }

    console.error(`[updateEnvironment] NOT FOUND - flagId: ${flagId}, envId: ${envId}`);
    throw new NotFoundException('Flag environment not found');
  }

  async updateValue(flagId: string, environmentId: string, dto: UpdateFlagValueDto) {
    const brandId = dto.brandId || null;
    
    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
    });

    if (existing) {
      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: {
          enabled: dto.enabled,
          defaultValue: dto.value,
        },
      });
    }

    return this.prisma.flagEnvironment.create({
      data: {
        flagId,
        environmentId,
        brandId,
        enabled: dto.enabled ?? false,
        defaultValue: dto.value ?? 'false',
      },
    });
  }

  async delete(flagId: string) {
    await this.prisma.featureFlag.delete({ where: { id: flagId } });
  }
}
