/**
 * Evaluate Flag Use Case
 * Core business logic for flag evaluation
 */

import { FlagRepository } from '../../infrastructure/persistence/flag.repository';
import { ProjectRepository } from '../../infrastructure/persistence/project.repository';
import { BrandRepository } from '../../infrastructure/persistence/brand.repository';
import { Result, success, failure, DomainError } from '../../shared/result';

export interface EvaluateFlagInput {
  projectKey: string;
  environmentKey: string;
  flagKey: string;
  organizationId: string;
  brandKey?: string | null;
  context?: Record<string, unknown>;
}

export interface FlagEvaluation {
  value: unknown;
  enabled: boolean;
  flagType: string;
}

export class EvaluateFlagUseCase {
  constructor(
    private readonly flagRepo: FlagRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly brandRepo: BrandRepository
  ) {}

  async execute(input: EvaluateFlagInput): Promise<Result<FlagEvaluation>> {
    // 1. Find project
    const projectResult = await this.projectRepo.findByKeyWithOrg(input.projectKey);
    if (!projectResult.success) {
      return failure(projectResult.error);
    }
    
    const project = projectResult.data;
    if (!project || project.organizationId !== input.organizationId) {
      return failure(DomainError.notFound('Project', input.projectKey));
    }

    // 2. Find flag
    const flagResult = await this.flagRepo.findByKey(project.id, input.flagKey);
    if (!flagResult.success) {
      return failure(flagResult.error);
    }
    
    const flag = flagResult.data;
    if (!flag) {
      return success({ value: false, enabled: false, flagType: 'BOOLEAN' });
    }

    // 3. Find brand if specified (for multi-tenant)
    let brandId: string | null = null;
    if (input.brandKey && project.isMultiTenant) {
      const brandResult = await this.brandRepo.findByKey(project.id, input.brandKey);
      if (brandResult.success && brandResult.data) {
        brandId = brandResult.data.id;
      }
    }

    // 4. Find flag value
    const valueResult = await this.flagRepo.findValue(
      flag.id,
      input.environmentKey,
      brandId
    );

    if (!valueResult.success) {
      return failure(valueResult.error);
    }

    const flagValue = valueResult.data;

    // 5. If no value found
    if (!flagValue) {
      return success({ value: false, enabled: false, flagType: flag.type });
    }

    // 6. If disabled, return false
    if (!flagValue.enabled) {
      return success({ value: false, enabled: false, flagType: flag.type });
    }

    // 7. Parse and return value
    const parsedValue = flag.parseValue(flagValue.value);

    return success({
      value: parsedValue,
      enabled: true,
      flagType: flag.type
    });
  }
}
