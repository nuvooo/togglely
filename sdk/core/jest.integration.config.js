/**
 * Jest configuration for integration tests
 * These tests run against the actual Docker backend
 * 
 * Run with: npm run test:integration
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', // Use node environment for integration tests
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*integration.test.ts', '**/__tests__/**/cors-security.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  // Longer timeout for integration tests
  testTimeout: 30000,
  // Verbose output
  verbose: true,
  // Don't run in band - let them run in parallel
  maxWorkers: 1, // But sequential to avoid conflicts
};
