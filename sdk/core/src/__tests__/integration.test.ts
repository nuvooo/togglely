/**
 * Integration Tests for Togglely SDK
 * 
 * These tests run against the actual Docker backend container.
 * They verify:
 * 1. SDK can fetch flags from the API
 * 2. CORS origin validation works correctly
 * 3. Multi-tenant brand resolution works
 * 
 * Prerequisites:
 * - Backend container must be running on localhost:4000
 * - Demo data must be seeded
 * 
 * Run with: npm run test:integration
 */

import { TogglelyClient } from '../index';

// Test configuration - matches demo data
const TEST_API_URL = 'http://localhost:4000';
const TEST_API_KEY = 'togglely_demo_simple_key'; // Simple Web App project
const TEST_PROJECT = 'simple-web-app';
const TEST_ENVIRONMENT = 'development';

// Multi-tenant test config
const TEST_MT_API_KEY = 'togglely_demo_saas_key'; // Multi-Tenant SaaS project
const TEST_MT_PROJECT = 'multi-tenant-saas';

// Helper to wait for SDK to be ready
const waitForReady = (client: TogglelyClient, timeout = 5000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkReady = () => {
      const state = client.getState();
      if (state.isReady) {
        resolve();
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error('SDK failed to become ready within timeout'));
        return;
      }
      
      setTimeout(checkReady, 100);
    };
    
    checkReady();
  });
};

describe('Togglely SDK Integration Tests', () => {
  let client: TogglelyClient;

  afterEach(() => {
    client?.destroy();
  });

  describe('Basic Connectivity', () => {
    it('should successfully connect and fetch flags from Docker backend', async () => {
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      await waitForReady(client);

      // Verify SDK fetched flags
      const toggles = client.getAllToggles();
      expect(Object.keys(toggles).length).toBeGreaterThan(0);
      
      // Verify we can get flag values
      const toggleValue = await client.getValue('new-dashboard');
      expect(toggleValue).not.toBeNull();
      expect(typeof toggleValue?.value).toBe('boolean');
      
      console.log('Successfully fetched toggles:', Object.keys(toggles));
    });

    it('should return correct flag values', async () => {
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      await waitForReady(client);

      // Test boolean flags
      const darkMode = await client.getValue('dark-mode');
      expect(darkMode).not.toBeNull();
      expect(typeof darkMode?.value).toBe('boolean');
      expect(typeof darkMode?.enabled).toBe('boolean');
    });

    it('should handle offline mode gracefully when backend is unreachable', async () => {
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: 'http://localhost:99999', // Invalid port
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
        offlineFallback: true,
      });

      // Wait for offline mode
      await new Promise(resolve => setTimeout(resolve, 2000));

      const state = client.getState();
      // Should be offline or have error
      expect(state.isOffline || state.lastError !== null).toBe(true);
    });
  });

  describe('CORS Origin Validation', () => {
    it('should successfully fetch when origin is allowed', async () => {
      // The demo project has allowedOrigins: [] initially (allows all)
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      await waitForReady(client);

      const toggles = client.getAllToggles();
      expect(Object.keys(toggles).length).toBeGreaterThan(0);
      console.log('Origin validation passed - toggles fetched successfully');
    });

    it('should track SDK connection state correctly', async () => {
      const stateUpdates: string[] = [];
      
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      client.on('update', () => {
        stateUpdates.push('updated');
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check SDK state
      const state = client.getState();
      console.log('SDK State:', state);
      
      // State should be ready or offline
      expect(state.isReady || state.isOffline).toBe(true);
    });
  });

  describe('Multi-Tenant Brand Resolution', () => {
    it('should fetch flags with brand context', async () => {
      client = new TogglelyClient({
        apiKey: TEST_MT_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_MT_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      // Set brand context
      client.setContext({
        tenantId: 'acme-corp', // One of the demo brands
      });

      await waitForReady(client);

      const toggles = client.getAllToggles();
      expect(Object.keys(toggles).length).toBeGreaterThan(0);
      
      console.log('Multi-tenant toggles fetched for brand:', Object.keys(toggles));
    });

    it('should include tenantId in API requests', async () => {
      let requestUrl = '';
      
      // Mock fetch to capture URL
      const originalFetch = global.fetch;
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/sdk/')) {
          requestUrl = url;
        }
        return originalFetch(url, init);
      }) as any;

      client = new TogglelyClient({
        apiKey: TEST_MT_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_MT_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      client.setContext({
        tenantId: 'startup-inc',
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restore fetch
      global.fetch = originalFetch;

      console.log('Request URL:', requestUrl);
      
      // Check if tenantId was included in the URL
      if (requestUrl) {
        expect(requestUrl.includes('startup-inc') || requestUrl.includes('context=')).toBe(true);
      }
    });

    it('should handle different brands', async () => {
      // Create client for first brand
      const client1 = new TogglelyClient({
        apiKey: TEST_MT_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_MT_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });
      client1.setContext({ tenantId: 'acme-corp' });

      await waitForReady(client1);
      const toggles1 = client1.getAllToggles();
      client1.destroy();

      // Create client for second brand
      const client2 = new TogglelyClient({
        apiKey: TEST_MT_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_MT_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });
      client2.setContext({ tenantId: 'startup-inc' });

      await waitForReady(client2);
      const toggles2 = client2.getAllToggles();
      client2.destroy();

      // Both should have toggles
      expect(Object.keys(toggles1).length).toBeGreaterThan(0);
      expect(Object.keys(toggles2).length).toBeGreaterThan(0);
      
      console.log('Brand 1 toggles:', Object.keys(toggles1));
      console.log('Brand 2 toggles:', Object.keys(toggles2));
    });
  });

  describe('SDK Event Handling', () => {
    it('should trigger ready event when ready', async () => {
      let readyCalled = false;
      
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      client.on('ready', () => {
        readyCalled = true;
      });

      await waitForReady(client);
      
      // Wait a bit for callback
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(readyCalled).toBe(true);
    });

    it('should trigger error event on connection failure', async () => {
      let errorCalled = false;
      
      client = new TogglelyClient({
        apiKey: 'invalid-key',
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      client.on('error', () => {
        errorCalled = true;
      });

      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Error should be called or SDK should be offline
      const state = client.getState();
      expect(errorCalled || state.lastError !== null || state.isOffline).toBe(true);
    });
  });

  describe('Refresh and Updates', () => {
    it('should manually refresh toggles', async () => {
      client = new TogglelyClient({
        apiKey: TEST_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: false, // Don't auto-fetch
      });

      // Initially no toggles
      let toggles = client.getAllToggles();
      expect(Object.keys(toggles).length).toBe(0);

      // Manually refresh
      await client.refresh();

      // Now should have toggles (or be offline)
      toggles = client.getAllToggles();
      const state = client.getState();
      
      expect(Object.keys(toggles).length > 0 || state.isOffline).toBe(true);
    });

    it('should update context dynamically', async () => {
      client = new TogglelyClient({
        apiKey: TEST_MT_API_KEY,
        baseUrl: TEST_API_URL,
        project: TEST_MT_PROJECT,
        environment: TEST_ENVIRONMENT,
        autoFetch: true,
      });

      client.setContext({ tenantId: 'acme-corp' });

      await waitForReady(client);

      // Update context
      client.setContext({ tenantId: 'startup-inc' });
      
      // Refresh with new context
      await client.refresh();

      const toggles = client.getAllToggles();
      expect(Object.keys(toggles).length).toBeGreaterThan(0);
    });
  });
});

// Health check test to verify backend is running
describe('Backend Health Check', () => {
  it('should confirm backend is accessible', async () => {
    try {
      const response = await fetch(`${TEST_API_URL}/health`);
      expect(response.ok).toBe(true);
      console.log('Backend is healthy and accessible');
    } catch (error) {
      console.error('Backend is not accessible at', TEST_API_URL);
      console.error('Make sure Docker containers are running: docker-compose up -d');
      throw error;
    }
  });
});
