import { SDK_CORS_ALLOWED_HEADERS, SDK_CORS_ALLOWED_METHODS, SDK_ERROR_CODES } from './sdk.constants';

export type SdkRequestLike = {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
};

export function extractSdkApiKey(req: SdkRequestLike): string | undefined {
  const queryApiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
  const authHeader = getHeader(req.headers, 'authorization');
  const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const headerApiKey = getHeader(req.headers, 'x-api-key');

  return queryApiKey || bearerKey || headerApiKey;
}

export function extractSdkOrigin(req: SdkRequestLike): string | undefined {
  return getHeader(req.headers, 'origin');
}

export function extractEffectiveBrandKey(query: Record<string, unknown>): string | undefined {
  const brandKey = typeof query.brandKey === 'string' ? query.brandKey : undefined;
  const tenantId = typeof query.tenantId === 'string' ? query.tenantId : undefined;

  return brandKey || tenantId;
}

export function setSdkCorsHeaders(
  res: { setHeader: (name: string, value: string) => void },
  origin?: string,
): void {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', SDK_CORS_ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', SDK_CORS_ALLOWED_HEADERS);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

export function mapSdkError(error: { status?: number; message?: string }): { status: number; body: { error: string; code: string } } {
  const message = error.message || 'Internal error';

  if (error.status === 401 || message.includes('Invalid API key')) {
    return {
      status: 401,
      body: { error: message || 'Invalid API key', code: SDK_ERROR_CODES.invalidApiKey },
    };
  }

  if (error.status === 403 || message.includes('Origin not allowed')) {
    return {
      status: 403,
      body: { error: message || 'Origin not allowed', code: SDK_ERROR_CODES.originNotAllowed },
    };
  }

  if (message.includes('Project not found')) {
    return {
      status: 404,
      body: { error: 'Project not found', code: SDK_ERROR_CODES.projectNotFound },
    };
  }

  if (message.includes('Environment not found')) {
    return {
      status: 404,
      body: { error: 'Environment not found', code: SDK_ERROR_CODES.environmentNotFound },
    };
  }

  return {
    status: 500,
    body: { error: message, code: SDK_ERROR_CODES.internalError },
  };
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return undefined;
}
