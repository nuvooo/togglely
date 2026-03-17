import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { Flag } from '../../domain/flag.entity';

@Injectable()
export class SdkService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateFlag(
    projectKey: string,
    environmentKey: string,
    flagKey: string,
    brandKey?: string,
  ) {
    // Find project by key (need orgId, so we search)
    const project = await this.prisma.project.findFirst({
      where: { key: projectKey },
    });
    
    if (!project) throw new NotFoundException('Project not found');

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    });
    
    if (!environment) throw new NotFoundException('Environment not found');

    const flag = await this.prisma.featureFlag.findFirst({
      where: { projectId: project.id, key: flagKey },
    });
    
    if (!flag) {
      return { value: false, enabled: false, flagType: 'BOOLEAN' };
    }

    let brandId: string | null = null;
    if (brandKey && project.type === 'MULTI') {
      const brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, key: brandKey },
      });
      if (brand) {
        brandId = brand.id;
      }
    }

    // Find or create flag environment
    let flagEnv = await this.prisma.flagEnvironment.findFirst({
      where: {
        flagId: flag.id,
        environmentId: environment.id,
        brandId: brandId || null,
      },
    });
    
    // Auto-create if missing
    if (!flagEnv) {
      flagEnv = await this.prisma.flagEnvironment.create({
        data: {
          flagId: flag.id,
          environmentId: environment.id,
          brandId: brandId || null,
          enabled: false,
          defaultValue: flag.flagType === 'BOOLEAN' ? 'false' : 
                       flag.flagType === 'NUMBER' ? '0' : 
                       flag.flagType === 'JSON' ? '{}' : '',
        },
      });
    }

    if (!flagEnv.enabled) {
      return { value: false, enabled: false, flagType: flag.flagType };
    }

    const domainFlag = Flag.reconstitute({
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description,
      type: flag.flagType as any,
      projectId: flag.projectId,
      organizationId: project.organizationId,
      createdById: flag.createdById || '',
      createdAt: flag.createdAt,
      updatedAt: flag.updatedAt,
    });

    const result = {
      value: domainFlag.parseValue(flagEnv.defaultValue),
      enabled: flagEnv.enabled,
      flagType: flag.flagType,
    };
    return result;
  }

  async evaluateAllFlags(
    projectKey: string,
    environmentKey: string,
    brandKey?: string,
  ) {
    // Find project by key
    const project = await this.prisma.project.findFirst({
      where: { key: projectKey },
    });
    
    if (!project) throw new NotFoundException('Project not found');

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    });
    
    if (!environment) throw new NotFoundException('Environment not found');

    // Get all flags for project
    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId: project.id },
    });

    let brandId: string | null = null;
    if (brandKey && project.type === 'MULTI') {
      const brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, key: brandKey },
      });
      if (brand) brandId = brand.id;
    }

    // Get all flag environments for this environment
    const flagEnvs = await this.prisma.flagEnvironment.findMany({
      where: {
        environmentId: environment.id,
      },
    });

    const results: Record<string, any> = {};

    for (const flag of flags) {
      // Find matching flag environment
      let flagEnv = flagEnvs.find(fe => 
        fe.flagId === flag.id && (brandId ? fe.brandId === brandId : !fe.brandId)
      );
      
      // Auto-create if missing
      if (!flagEnv) {
        flagEnv = await this.prisma.flagEnvironment.create({
          data: {
            flagId: flag.id,
            environmentId: environment.id,
            brandId: brandId || null,
            enabled: false,
            defaultValue: flag.flagType === 'BOOLEAN' ? 'false' : 
                         flag.flagType === 'NUMBER' ? '0' : 
                         flag.flagType === 'JSON' ? '{}' : '',
          },
        });
      }

      if (!flagEnv.enabled) {
        results[flag.key] = {
          value: false,
          enabled: false,
          flagType: flag.flagType,
        };
      } else {
        const domainFlag = Flag.reconstitute({
          id: flag.id,
          key: flag.key,
          name: flag.name,
          description: flag.description,
          type: flag.flagType as any,
          projectId: flag.projectId,
          organizationId: project.organizationId,
          createdById: flag.createdById || '',
          createdAt: flag.createdAt,
          updatedAt: flag.updatedAt,
        });

        results[flag.key] = {
          value: domainFlag.parseValue(flagEnv.defaultValue),
          enabled: flagEnv.enabled,
          flagType: flag.flagType,
        };
      }
    }

    return results;
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
    });
    
    // Check if any active key matches the provided key
    return keys.some(k => k.key === apiKey);
  }
}
