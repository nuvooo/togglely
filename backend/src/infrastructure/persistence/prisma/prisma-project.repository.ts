/**
 * Prisma Project Repository Implementation
 */

import { PrismaClient } from '@prisma/client';
import { ProjectRepository, FindProjectsOptions } from '../project.repository';
import { Project } from '../../../domain/project/project.entity';
import { Result, success, failure, DomainError } from '../../../shared/result';

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Result<Project | null>> {
    try {
      const data = await this.prisma.project.findUnique({ where: { id } });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(DomainError.notFound('Project', id));
    }
  }

  async findByKey(organizationId: string, key: string): Promise<Result<Project | null>> {
    try {
      const data = await this.prisma.project.findFirst({
        where: { organizationId, key }
      });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async findByKeyWithOrg(key: string): Promise<Result<Project | null>> {
    try {
      const data = await this.prisma.project.findFirst({
        where: { key },
        include: { organization: true }
      });
      if (!data) return success(null);
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async findMany(options: FindProjectsOptions): Promise<Result<Project[]>> {
    try {
      const data = await this.prisma.project.findMany({
        where: options.organizationId ? { organizationId: options.organizationId } : {},
        take: options.limit,
        skip: options.offset,
        orderBy: { createdAt: 'desc' }
      });
      return success(data.map(d => this.toDomain(d)));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  async save(project: Project): Promise<Result<Project>> {
    try {
      const data = await this.prisma.project.upsert({
        where: { id: project.id },
        update: {
          name: project.name,
          description: project.description,
          allowedOrigins: project.allowedOrigins,
          updatedAt: new Date()
        },
        create: {
          id: project.id,
          name: project.name,
          key: project.key,
          description: project.description,
          type: project.type,
          allowedOrigins: project.allowedOrigins,
          organizationId: project.organizationId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      return success(this.toDomain(data));
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to save project'));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.prisma.project.delete({ where: { id } });
      return success(undefined);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Failed to delete project'));
    }
  }

  async exists(key: string, organizationId: string): Promise<Result<boolean>> {
    try {
      const count = await this.prisma.project.count({
        where: { key, organizationId }
      });
      return success(count > 0);
    } catch (error) {
      return failure(new DomainError('INTERNAL_ERROR', 'Database error'));
    }
  }

  private toDomain(data: any): Project {
    return Project.reconstitute({
      id: data.id,
      name: data.name,
      key: data.key,
      description: data.description,
      type: data.type,
      allowedOrigins: data.allowedOrigins || [],
      organizationId: data.organizationId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }
}
