/**
 * Prisma Flag Repository Implementation (Adapter)
 */

import { PrismaClient } from '@prisma/client';
import { FlagRepository, FindFlagsOptions, FindFlagValuesOptions } from '../flag.repository';
import { Flag } from '../../../domain/flag/flag.entity';
import { FlagValue } from '../../../domain/flag/flag-value.entity';
import { Result, success, failure, DomainError } from '../../../shared/result';

export class PrismaFlagRepository implements FlagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Result<Flag | null>> {
    try {
      const data = await this.prisma.featureFlag.findUnique({ where: { id } });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(DomainError.notFound('Flag', id));
    }
  }

  async findByKey(projectId: string, key: string): Promise<Result<Flag | null>> {
    try {
      const data = await this.prisma.featureFlag.findFirst({
        where: { projectId, key }
      });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async findMany(options: FindFlagsOptions): Promise<Result<Flag[]>> {
    try {
      const data = await this.prisma.featureFlag.findMany({
        where: {
          ...(options.projectId && { projectId: options.projectId }),
          ...(options.organizationId && { organizationId: options.organizationId })
        },
        take: options.limit,
        skip: options.offset,
        orderBy: { createdAt: 'desc' }
      });
      return success(data.map(d => this.toDomain(d)));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async save(flag: Flag): Promise<Result<Flag>> {
    try {
      const data = await this.prisma.featureFlag.upsert({
        where: { id: flag.id },
        update: {
          name: flag.name,
          description: flag.description,
          updatedAt: flag.updatedAt
        },
        create: {
          id: flag.id,
          key: flag.key,
          name: flag.name,
          description: flag.description,
          flagType: flag.type,
          projectId: flag.projectId,
          organizationId: flag.organizationId,
          createdById: flag.createdById,
          createdAt: flag.createdAt,
          updatedAt: flag.updatedAt
        }
      });
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to save flag'));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.prisma.featureFlag.delete({ where: { id } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete flag'));
    }
  }

  // FlagValue operations
  async findValueById(id: string): Promise<Result<FlagValue | null>> {
    try {
      const data = await this.prisma.flagEnvironment.findUnique({ where: { id } });
      if (!data) return success(null);
      return success(this.toValueDomain(data));
    } catch (error) {
      return failure(DomainError.notFound('FlagValue', id));
    }
  }

  async findValue(flagId: string, environmentId: string, brandId: string | null): Promise<Result<FlagValue | null>> {
    try {
      const data = await this.prisma.flagEnvironment.findFirst({
        where: { flagId, environmentId, brandId: brandId ?? null }
      });
      if (!data) return success(null);
      return success(this.toValueDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async findManyValues(options: FindFlagValuesOptions): Promise<Result<FlagValue[]>> {
    try {
      const data = await this.prisma.flagEnvironment.findMany({
        where: {
          ...(options.flagId && { flagId: options.flagId }),
          ...(options.environmentId && { environmentId: options.environmentId }),
          ...(options.brandId !== undefined && { brandId: options.brandId })
        }
      });
      return success(data.map(d => this.toValueDomain(d)));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async saveValue(value: FlagValue): Promise<Result<FlagValue>> {
    try {
      const data = await this.prisma.flagEnvironment.upsert({
        where: { id: value.id },
        update: {
          enabled: value.enabled,
          defaultValue: value.value,
          updatedAt: value.updatedAt
        },
        create: {
          id: value.id,
          flagId: value.flagId,
          environmentId: value.environmentId,
          brandId: value.brandId,
          enabled: value.enabled,
          defaultValue: value.value,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt
        }
      });
      return success(this.toValueDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to save flag value'));
    }
  }

  async deleteValue(id: string): Promise<Result<void>> {
    try {
      await this.prisma.flagEnvironment.delete({ where: { id } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete flag value'));
    }
  }

  async deleteValuesByFlag(flagId: string): Promise<Result<void>> {
    try {
      await this.prisma.flagEnvironment.deleteMany({ where: { flagId } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete flag values'));
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<Result<T>> {
    try {
      const result = await this.prisma.$transaction(async () => await fn());
      return success(result);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Transaction failed'));
    }
  }

  // Mappers
  private toDomain(data: any): Flag {
    return Flag.reconstitute({
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      type: data.flagType,
      projectId: data.projectId,
      organizationId: data.organizationId,
      createdById: data.createdById,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }

  private toValueDomain(data: any): FlagValue {
    return FlagValue.reconstitute({
      id: data.id,
      flagId: data.flagId,
      environmentId: data.environmentId,
      brandId: data.brandId,
      enabled: data.enabled,
      value: data.defaultValue,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }
}
