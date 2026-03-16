/**
 * Simple Dependency Injection Container
 * Lightweight alternative to heavy frameworks
 */

import { PrismaClient } from '@prisma/client';
import { PrismaFlagRepository } from '../infrastructure/persistence/prisma/prisma-flag.repository';
import { PrismaProjectRepository } from '../infrastructure/persistence/prisma/prisma-project.repository';
import { PrismaBrandRepository } from '../infrastructure/persistence/prisma/prisma-brand.repository';
import { EvaluateFlagUseCase } from '../application/flag/evaluate-flag.usecase';

export type Constructor<T> = new (...args: any[]) => T;
export type Factory<T> = () => T;

export interface Provider<T = any> {
  token: symbol | string;
  useClass?: Constructor<T>;
  useValue?: T;
  useFactory?: Factory<T>;
}

export class Container {
  private static instance: Container;
  private providers = new Map<symbol | string, Provider>();
  private instances = new Map<symbol | string, any>();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  register<T>(provider: Provider<T>): void {
    this.providers.set(provider.token, provider);
  }

  registerClass<T>(token: symbol | string, useClass: Constructor<T>): void {
    this.providers.set(token, { token, useClass });
  }

  registerValue<T>(token: symbol | string, useValue: T): void {
    this.providers.set(token, { token, useValue });
  }

  registerFactory<T>(token: symbol | string, useFactory: Factory<T>): void {
    this.providers.set(token, { token, useFactory });
  }

  resolve<T>(token: symbol | string): T {
    // Return cached instance
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    const provider = this.providers.get(token);
    if (!provider) {
      throw new Error(`No provider found for token: ${token.toString()}`);
    }

    let instance: T;

    if (provider.useValue !== undefined) {
      instance = provider.useValue;
    } else if (provider.useFactory) {
      instance = provider.useFactory();
    } else if (provider.useClass) {
      instance = new provider.useClass();
    } else {
      throw new Error(`Invalid provider for token: ${token.toString()}`);
    }

    // Cache instance
    this.instances.set(token, instance);
    return instance;
  }

  clear(): void {
    this.providers.clear();
    this.instances.clear();
  }
}

// Global container instance
export const container = Container.getInstance();

// Symbols for DI
export const FLAG_REPOSITORY = Symbol('FlagRepository');
export const PROJECT_REPOSITORY = Symbol('ProjectRepository');
export const BRAND_REPOSITORY = Symbol('BrandRepository');
export const EVALUATE_FLAG_USE_CASE = Symbol('EvaluateFlagUseCase');

// Setup function to initialize all dependencies
export function setupContainer(prisma: PrismaClient): void {
  // Register repositories
  container.registerFactory(FLAG_REPOSITORY, () => new PrismaFlagRepository(prisma));
  container.registerFactory(PROJECT_REPOSITORY, () => new PrismaProjectRepository(prisma));
  container.registerFactory(BRAND_REPOSITORY, () => new PrismaBrandRepository(prisma));

  // Register use cases with dependencies
  container.registerFactory(EVALUATE_FLAG_USE_CASE, () => {
    return new EvaluateFlagUseCase(
      container.resolve(FLAG_REPOSITORY),
      container.resolve(PROJECT_REPOSITORY),
      container.resolve(BRAND_REPOSITORY)
    );
  });
}
