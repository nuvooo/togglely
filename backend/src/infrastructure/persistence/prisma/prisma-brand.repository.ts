/**
 * Prisma Brand Repository Implementation
 */

import { PrismaClient } from '@prisma/client';
import { BrandRepository } from '../brand.repository';
import { Brand } from '../../../domain/brand/brand.entity';
import { Result, success, failure, DomainError } from '../../../shared/result';

export class PrismaBrandRepository implements BrandRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Result<Brand | null>> {
    try {
      const data = await this.prisma.brand.findUnique({ where: { id } });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(DomainError.notFound('Brand', id));
    }
  }

  async findByKey(projectId: string, key: string): Promise<Result<Brand | null>> {
    try {
      const data = await this.prisma.brand.findFirst({
        where: { projectId, key }
      });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async findByProject(projectId: string): Promise<Result<Brand[]>> {
    try {
      const data = await this.prisma.brand.findMany({
        where: { projectId },
        orderBy: { name: 'asc' }
      });
      return success(data.map(d => this.toDomain(d)));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async save(brand: Brand): Promise<Result<Brand>> {
    try {
      const data = await this.prisma.brand.upsert({
        where: { id: brand.id },
        update: {
          name: brand.name,
          description: brand.description,
          updatedAt: new Date()
        },
        create: {
          id: brand.id,
          name: brand.name,
          key: brand.key,
          description: brand.description,
          projectId: brand.projectId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to save brand'));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.prisma.brand.delete({ where: { id } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete brand'));
    }
  }

  async deleteByProject(projectId: string): Promise<Result<void>> {
    try {
      await this.prisma.brand.deleteMany({ where: { projectId } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete brands'));
    }
  }

  private toDomain(data: any): Brand {
    return Brand.reconstitute({
      id: data.id,
      name: data.name,
      key: data.key,
      description: data.description,
      projectId: data.projectId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }
}
