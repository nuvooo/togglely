import { Injectable, NotFoundException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { Flag } from '../../domain/flag.entity';

@Injectable()
export class SdkService {
  private readonly logger = new Logger(SdkService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async validateApiKeyAndOrigin(
    apiKey: string,
    projectKey: string,
    origin?: string,
  ): Promise<void> {
    this.logger.debug(`[SDK Service] Validating API key for project: ${projectKey}`);
    
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
    });

    if (!keyRecord) {
      this.logger.debug(`[SDK Service] ERROR: API key not found or inactive`);
      throw new UnauthorizedException('Invalid API key');
    }
    
    this.logger.debug(`[SDK Service] API key found, org: ${keyRecord.organizationId}`);

    // Check if key belongs to project's organization
    const project = keyRecord.organization.projects[0];
    if (!project) {
      this.logger.debug(`[SDK Service] ERROR: Project ${projectKey} not found in organization`);
      throw new UnauthorizedException('API key does not have access to this project');
    }
    
    this.logger.debug(`[SDK Service] Project found: ${project.id}, allowedOrigins:`, project.allowedOrigins);

    // Check origin if project has allowedOrigins
    if (origin && project.allowedOrigins && project.allowedOrigins.length > 0) {
      const allowed = project.allowedOrigins.some((allowed: string) => {
        if (allowed === '*') return true;
        if (allowed === origin) return true;
        // Support wildcards like *.example.com
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return origin.endsWith(domain);
        }
        return false;
      });

      if (!allowed) {
        this.logger.debug(`[SDK Service] ERROR: Origin ${origin} not in allowedOrigins`);
        throw new ForbiddenException('Origin not allowed');
      }
      this.logger.debug(`[SDK Service] Origin ${origin} allowed`);
    }
  }

  async evaluateFlag(
    projectKey: string,
    environmentKey: string,
    flagKey: string,
    apiKey: string,
    brandKey?: string,
    origin?: string,
  ) {
    this.logger.debug(`[SDK Service] evaluateFlag: ${flagKey} for ${projectKey}/${environmentKey}`);
    
    // Validate API key first
    await this.validateApiKeyAndOrigin(apiKey, projectKey, origin);
    
    // Find project by key (need orgId, so we search)
    const project = await this.prisma.project.findFirst({
      where: { key: projectKey },
    });
    
    if (!project) {
      this.logger.debug(`[SDK Service] ERROR: Project ${projectKey} not found`);
      throw new NotFoundException('Project not found');
    }
    this.logger.debug(`[SDK Service] Project found: ${project.id}`);

    const environment = await this.prisma.environment.findFirst({
      where: { projectId: project.id, key: environmentKey },
    });
    
    if (!environment) {
      this.logger.debug(`[SDK Service] ERROR: Environment ${environmentKey} not found`);
      throw new NotFoundException('Environment not found');
    }
    this.logger.debug(`[SDK Service] Environment found: ${environment.id}`);

    const flag = await this.prisma.featureFlag.findFirst({
      where: { projectId: project.id, key: flagKey },
    });
    
    if (!flag) {
      this.logger.debug(`[SDK Service] WARNING: Flag ${flagKey} not found, returning disabled`);
      return { value: false, enabled: false, flagType: 'BOOLEAN' };
    }
    this.logger.debug(`[SDK Service] Flag found: ${flag.id}, type: ${flag.flagType}`);

    let brandId: string | null = null;
    if (brandKey && project.type === 'MULTI') {
      // Try to find by key first, then by id (in case brandKey is actually an id)
      let brand = await this.prisma.brand.findFirst({
        where: { projectId: project.id, key: brandKey },
      });
      
      // If not found by key, try by id
      if (!brand) {
        brand = await this.prisma.brand.findFirst({
          where: { projectId: project.id, id: brandKey },
        });
      }
      
      if (brand) {
        brandId = brand.id;
        this.logger.debug(`[SDK Service] Brand found: ${brand.id} (key: ${brand.key})`);
      } else {
        this.logger.debug(`[SDK Service] Brand not found for key/id: ${brandKey}`);
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
      this.logger.debug(`[SDK Service] FlagEnvironment not found, auto-creating with disabled state`);
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
    
    this.logger.debug(`[SDK Service] FlagEnvironment: enabled=${flagEnv.enabled}, value=${flagEnv.defaultValue}`);

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

    return {
      value: domainFlag.parseValue(flagEnv.defaultValue),
      enabled: flagEnv.enabled,
      flagType: flag.flagType,
    };
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
      if (brand) {
        brandId = brand.id;
      }
    }

    // Get all flag environments for this environment and brand
    const flagEnvs = await this.prisma.flagEnvironment.findMany({
      where: {
        environmentId: environment.id,
        OR: [
          { brandId: brandId },
          { brandId: null }
        ]
      },
    });

    const results: Record<string, any> = {};

    this.logger.debug(`[SDK getAllFlags] Processing ${flags.length} flags, brandId: ${brandId}, envId: ${environment.id}`);
    
    for (const flag of flags) {
      // Find matching flag environment for this brand
      let flagEnv = flagEnvs.find(fe => fe.flagId === flag.id && fe.brandId === brandId);
      
      // If we are in a MULTI project but no brand-specific env exists yet, 
      // check if a global (null brand) one exists to inherit from, or create brand-specific
      if (!flagEnv && brandId) {
        const globalEnv = flagEnvs.find(fe => fe.flagId === flag.id && !fe.brandId);
        
        // Auto-create brand-specific from global if available, or from defaults
        // Note: enabled is ALWAYS true for brand-specific entries because if it's in the DB 
        // as brand-specific, it means the user specifically set it for this brand.
        // If it doesn't exist yet, it "doesn't matter" for the frontends UI, but for the SDK 
        // we check the global state.
        flagEnv = await this.prisma.flagEnvironment.create({
          data: {
            flagId: flag.id,
            environmentId: environment.id,
            brandId: brandId,
            enabled: globalEnv?.enabled ?? false,
            defaultValue: globalEnv?.defaultValue ?? (
              flag.flagType === 'BOOLEAN' ? 'false' : 
              flag.flagType === 'NUMBER' ? '0' : 
              flag.flagType === 'JSON' ? '{}' : ''
            ),
          },
        });
      } else if (!flagEnv && !brandId) {
        // Simple case: no brand, no env found (shouldn't happen often with findMany above, but for safety)
        flagEnv = await this.prisma.flagEnvironment.create({
          data: {
            flagId: flag.id,
            environmentId: environment.id,
            brandId: null,
            enabled: false,
            defaultValue: flag.flagType === 'BOOLEAN' ? 'false' : 
                         flag.flagType === 'NUMBER' ? '0' : 
                         flag.flagType === 'JSON' ? '{}' : '',
          },
        });
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

      results[flag.key] = {
        value: domainFlag.parseValue(flagEnv.defaultValue),
        enabled: flagEnv.enabled,
        flagType: flag.flagType,
      };
    }

    return results;
  }

  async getAllFlags(
    projectKey: string,
    environmentKey: string,
    apiKey: string,
    brandKey?: string,
    origin?: string,
  ): Promise<Record<string, any>> {
    // Validate API key first
    await this.validateApiKeyAndOrigin(apiKey, projectKey, origin);

    return this.evaluateAllFlags(projectKey, environmentKey, brandKey);
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
