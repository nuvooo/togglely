/**
 * Flag Repository Interface (Port)
 * Defines what operations the domain needs from persistence
 */

import { Flag } from '../../domain/flag/flag.entity';
import { FlagValue } from '../../domain/flag/flag-value.entity';
import { Result } from '../../shared/result';

export interface FindFlagsOptions {
  projectId?: string;
  organizationId?: string;
  limit?: number;
  offset?: number;
}

export interface FindFlagValuesOptions {
  flagId?: string;
  environmentId?: string;
  brandId?: string | null;
}

export interface FlagRepository {
  // Flag operations
  findById(id: string): Promise<Result<Flag | null>>;
  findByKey(projectId: string, key: string): Promise<Result<Flag | null>>;
  findMany(options: FindFlagsOptions): Promise<Result<Flag[]>>;
  save(flag: Flag): Promise<Result<Flag>>;
  delete(id: string): Promise<Result<void>>;
  
  // FlagValue operations
  findValueById(id: string): Promise<Result<FlagValue | null>>;
  findValue(flagId: string, environmentId: string, brandId: string | null): Promise<Result<FlagValue | null>>;
  findManyValues(options: FindFlagValuesOptions): Promise<Result<FlagValue[]>>;
  saveValue(value: FlagValue): Promise<Result<FlagValue>>;
  deleteValue(id: string): Promise<Result<void>>;
  deleteValuesByFlag(flagId: string): Promise<Result<void>>;
  
  // Transaction support
  transaction<T>(fn: () => Promise<T>): Promise<Result<T>>;
}

// Token for Dependency Injection
export const FLAG_REPOSITORY_TOKEN = Symbol('FlagRepository');
