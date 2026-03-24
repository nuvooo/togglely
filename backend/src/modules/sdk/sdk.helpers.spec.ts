import { getDefaultFlagValue, isOriginAllowed, toSdkFlagResponse } from './sdk.helpers';

describe('sdk.helpers', () => {
  describe('isOriginAllowed', () => {
    it('supports exact, wildcard, and subdomain matches', () => {
      expect(isOriginAllowed('https://app.example.com', ['https://app.example.com'])).toBe(true);
      expect(isOriginAllowed('https://foo.example.com', ['*.example.com'])).toBe(true);
      expect(isOriginAllowed('https://anywhere.com', ['*'])).toBe(true);
      expect(isOriginAllowed('https://evil.com', ['https://app.example.com'])).toBe(false);
    });
  });

  describe('getDefaultFlagValue', () => {
    it('returns stable defaults by flag type', () => {
      expect(getDefaultFlagValue('BOOLEAN')).toBe('false');
      expect(getDefaultFlagValue('NUMBER')).toBe('0');
      expect(getDefaultFlagValue('JSON')).toBe('{}');
      expect(getDefaultFlagValue('STRING')).toBe('');
    });
  });

  describe('toSdkFlagResponse', () => {
    it('parses raw database values into sdk response values', () => {
      const baseFlag = {
        id: 'flag-1',
        key: 'feature-a',
        name: 'Feature A',
        description: null,
        flagType: 'BOOLEAN' as const,
        projectId: 'project-1',
        createdById: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      expect(toSdkFlagResponse(baseFlag, 'org-1', 'true', true)).toEqual({
        value: true,
        enabled: true,
        flagType: 'BOOLEAN',
      });
    });
  });
});
