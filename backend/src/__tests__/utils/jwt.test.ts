import { generateToken, verifyToken, generateApiKey } from '../../utils/jwt';

describe('JWT Utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, JWT_SECRET: 'test-secret-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = { userId: 'user123', email: 'test@example.com' };
      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate token that can be verified', () => {
      const payload = { userId: 'user123', email: 'test@example.com' };
      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = { userId: 'user123', email: 'test@example.com' };
      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded).toMatchObject(payload);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow();
    });

    it('should throw error for tampered token', () => {
      const payload = { userId: 'user123', email: 'test@example.com' };
      const token = generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      expect(() => verifyToken(tamperedToken)).toThrow();
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with correct prefix', () => {
      const apiKey = generateApiKey();
      expect(apiKey.startsWith('flagify_')).toBe(true);
    });

    it('should generate unique API keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).not.toBe(key2);
    });

    it('should generate API key of correct length', () => {
      const apiKey = generateApiKey();
      expect(apiKey.length).toBe(56);
    });

    it('should generate API key with only valid characters', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^flagify_[A-Za-z0-9]+$/);
    });
  });
});
