/**
 * Project Repository Interface (Port)
 */

import { Project } from '../../domain/project/project.entity';
import { Result } from '../../shared/result';

export interface FindProjectsOptions {
  organizationId?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectRepository {
  findById(id: string): Promise<Result<Project | null>>;
  findByKey(organizationId: string, key: string): Promise<Result<Project | null>>;
  findByKeyWithOrg(key: string): Promise<Result<Project | null>>;
  findMany(options: FindProjectsOptions): Promise<Result<Project[]>>;
  save(project: Project): Promise<Result<Project>>;
  delete(id: string): Promise<Result<void>>;
  exists(key: string, organizationId: string): Promise<Result<boolean>>;
}

export const PROJECT_REPOSITORY_TOKEN = Symbol('ProjectRepository');
