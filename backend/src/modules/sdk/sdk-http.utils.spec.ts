import {
  extractEffectiveBrandKey,
  extractSdkApiKey,
  extractSdkOrigin,
  mapSdkError,
} from './sdk-http.utils';

describe('sdk-http.utils', () => {
  describe('extractSdkApiKey', () => {
    it('prefers apiKey from query string', () => {
      const apiKey = extractSdkApiKey({
        headers: {
          authorization: 'Bearer bearer-key',
          'x-api-key': 'header-key',
        },
        query: {
          apiKey: 'query-key',
        },
      });

      expect(apiKey).toBe('query-key');
    });

    it('falls back to bearer token and x-api-key header', () => {
      expect(
        extractSdkApiKey({
          headers: { authorization: 'Bearer bearer-key' },
          query: {},
        }),
      ).toBe('bearer-key');

      expect(
        extractSdkApiKey({
          headers: { 'x-api-key': 'header-key' },
          query: {},
        }),
      ).toBe('header-key');
    });
  });

  describe('extractEffectiveBrandKey', () => {
    it('prefers brandKey over tenantId', () => {
      expect(
        extractEffectiveBrandKey({
          brandKey: 'brand-a',
          tenantId: 'tenant-a',
        }),
      ).toBe('brand-a');
    });

    it('falls back to tenantId', () => {
      expect(
        extractEffectiveBrandKey({
          tenantId: 'tenant-a',
        }),
      ).toBe('tenant-a');
    });
  });

  describe('extractSdkOrigin', () => {
    it('returns the request origin header', () => {
      expect(
        extractSdkOrigin({
          headers: { origin: 'https://app.example.com' },
          query: {},
        }),
      ).toBe('https://app.example.com');
    });
  });

  describe('mapSdkError', () => {
    it('maps auth/origin/not-found errors to stable response payloads', () => {
      expect(mapSdkError({ status: 401, message: 'Invalid API key' })).toEqual({
        status: 401,
        body: { error: 'Invalid API key', code: 'INVALID_API_KEY' },
      });

      expect(mapSdkError({ status: 403, message: 'Origin not allowed' })).toEqual({
        status: 403,
        body: { error: 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' },
      });

      expect(mapSdkError({ message: 'Project not found' })).toEqual({
        status: 404,
        body: { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });

      expect(mapSdkError({ message: 'Environment not found' })).toEqual({
        status: 404,
        body: { error: 'Environment not found', code: 'ENV_NOT_FOUND' },
      });
    });

    it('returns a safe fallback for unexpected errors', () => {
      expect(mapSdkError({ message: 'Boom' })).toEqual({
        status: 500,
        body: { error: 'Boom', code: 'INTERNAL_ERROR' },
      });
    });
  });
});
