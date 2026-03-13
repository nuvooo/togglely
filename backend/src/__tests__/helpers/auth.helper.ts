import { generateToken } from '../../utils/jwt';

export const createTestUser = (overrides = {}) => ({
  id: 'user12345678901234567890',
  email: 'test@example.com',
  password: 'hashedPassword123',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createTestOrganization = (overrides = {}) => ({
  id: 'org1234567890123456789012',
  name: 'Test Organization',
  slug: 'test-organization',
  description: 'A test organization',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  _count: {
    members: 1,
    projects: 0,
  },
  ...overrides,
});

export const createTestProject = (overrides = {}) => ({
  id: 'proj123456789012345678901',
  name: 'Test Project',
  key: 'test-project',
  description: 'A test project',
  organizationId: 'org1234567890123456789012',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  _count: {
    featureFlags: 0,
    environments: 0,
  },
  ...overrides,
});

export const createTestFeatureFlag = (overrides = {}) => ({
  id: 'flag123456789012345678901',
  name: 'Test Feature',
  key: 'test-feature',
  description: 'A test feature flag',
  flagType: 'BOOLEAN',
  projectId: 'proj123456789012345678901',
  organizationId: 'org1234567890123456789012',
  createdById: 'user12345678901234567890',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createTestToken = (userId: string = 'user12345678901234567890', email: string = 'test@example.com') => {
  return generateToken({ userId, email });
};

export const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});
