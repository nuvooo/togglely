/**
 * Brand Repository Interface (Port)
 */

import { Brand } from '../../domain/brand/brand.entity';
import { Result } from '../../shared/result';

export interface BrandRepository {
  findById(id: string): Promise<Result<Brand | null>>;
  findByKey(projectId: string, key: string): Promise<Result<Brand | null>>;
  findByProject(projectId: string): Promise<Result<Brand[]>>;
  save(brand: Brand): Promise<Result<Brand>>;
  delete(id: string): Promise<Result<void>>;
  deleteByProject(projectId: string): Promise<Result<void>>;
}

export const BRAND_REPOSITORY_TOKEN = Symbol('BrandRepository');
