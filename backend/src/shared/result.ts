/**
 * Result Pattern for functional error handling
 * No exceptions - explicit error types
 */

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const success = <T>(data: T): Result<T, never> => ({
  success: true,
  data
});

export const failure = <E>(error: E): Result<never, E> => ({
  success: false,
  error
});

// Domain Errors
type DomainErrorCode = 
  | 'NOT_FOUND' 
  | 'ALREADY_EXISTS' 
  | 'INVALID_INPUT' 
  | 'UNAUTHORIZED' 
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    public readonly message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(entity: string, id: string): DomainError {
    return new DomainError('NOT_FOUND', `${entity} with id ${id} not found`);
  }

  static alreadyExists(entity: string, key: string): DomainError {
    return new DomainError('ALREADY_EXISTS', `${entity} with key ${key} already exists`);
  }

  static invalidInput(field: string, reason: string): DomainError {
    return new DomainError('INVALID_INPUT', `Invalid input for ${field}: ${reason}`);
  }

  static unauthorized(): DomainError {
    return new DomainError('UNAUTHORIZED', 'Authentication required');
  }

  static forbidden(): DomainError {
    return new DomainError('FORBIDDEN', 'Access denied');
  }
}
