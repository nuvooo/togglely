export const SDK_CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const SDK_CORS_ALLOWED_HEADERS = 'Content-Type, Authorization, X-API-Key, X-Requested-With';

export const SDK_ERROR_CODES = {
  missingApiKey: 'MISSING_API_KEY',
  invalidApiKey: 'INVALID_API_KEY',
  originNotAllowed: 'ORIGIN_NOT_ALLOWED',
  projectNotFound: 'PROJECT_NOT_FOUND',
  environmentNotFound: 'ENV_NOT_FOUND',
  internalError: 'INTERNAL_ERROR',
} as const;
