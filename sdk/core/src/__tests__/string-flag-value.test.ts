/**
 * Integration Test: String Flag Value Bug
 * 
 * This test reproduces the issue where a STRING flag with value "hallo"
 * returns "false" instead of the actual value.
 */

import { TogglelyClient } from '../index';

const TEST_API_URL = 'http://localhost:4000';
const TEST_API_KEY = 'togglely_demo_saas_key';
const TEST_PROJECT = 'multi-tenant-saas';
const TEST_ENVIRONMENT = 'development';

describe('String Flag Value Bug', () => {
  let client: TogglelyClient;

  beforeEach(() => {
    client = new TogglelyClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_API_URL,
      project: TEST_PROJECT,
      environment: TEST_ENVIRONMENT,
      autoFetch: false,
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it('should return correct string value for existing flag', async () => {
    // Get the "welcome-message" flag (STRING type in demo data)
    const result = await client.getValue('welcome-message');
    
    console.log('welcome-message result:', JSON.stringify(result, null, 2));
    
    // The value should be a string, not "false"
    expect(result).not.toBeNull();
    expect(result?.value).not.toBe('false');
    expect(result?.value).not.toBe(false);
    
    // For STRING type, value should be the actual string value
    expect(typeof result?.value).toBe('string');
  });

  it('should return correct boolean value for boolean flag', async () => {
    // Get the "premium-features" flag (BOOLEAN type)
    const result = await client.getValue('premium-features');
    
    console.log('premium-features result:', JSON.stringify(result, null, 2));
    
    expect(result).not.toBeNull();
    // Boolean flag should return actual boolean
    expect(typeof result?.value).toBe('boolean');
  });

  it('should return correct value with brand context', async () => {
    client.setContext({ tenantId: 'acme-corp' });
    
    const result = await client.getValue('welcome-message');
    
    console.log('welcome-message with brand:', JSON.stringify(result, null, 2));
    
    expect(result).not.toBeNull();
    expect(result?.value).not.toBe('false');
  });

  it('should fetch all flags and verify string values', async () => {
    await client.refresh();
    
    const allToggles = client.getAllToggles();
    
    console.log('All toggles:', JSON.stringify(allToggles, null, 2));
    
    // Check each flag
    Object.entries(allToggles).forEach(([key, toggle]) => {
      console.log(`Flag ${key}:`, {
        value: toggle.value,
        enabled: toggle.enabled,
        valueType: typeof toggle.value
      });
      
      // No flag should have "false" as string value unless it's a boolean false
      if (toggle.value === 'false' && toggle.enabled) {
        console.error(`BUG DETECTED: Flag "${key}" has string "false" but is enabled!`);
      }
    });
  });
});

// Direct API test without SDK
describe('Direct API Test', () => {
  it('should return correct value from API directly', async () => {
    const url = `${TEST_API_URL}/sdk/flags/${TEST_PROJECT}/${TEST_ENVIRONMENT}/welcome-message?apiKey=${TEST_API_KEY}`;
    
    console.log('Fetching:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('API Response:', JSON.stringify(data, null, 2));
    
    expect(data.value).not.toBe('false');
    expect(data.value).not.toBe(false);
    expect(typeof data.value).toBe('string');
  });

  it('should return correct value with brandKey', async () => {
    const url = `${TEST_API_URL}/sdk/flags/${TEST_PROJECT}/${TEST_ENVIRONMENT}/welcome-message?apiKey=${TEST_API_KEY}&brandKey=acme-corp`;
    
    console.log('Fetching with brand:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('API Response with brand:', JSON.stringify(data, null, 2));
    
    // This is where the bug manifests - value should NOT be "false"
    if (data.value === 'false' || data.value === false) {
      console.error('BUG CONFIRMED: API returns false instead of actual value!');
    }
    
    expect(data.value).not.toBe('false');
    expect(data.value).not.toBe(false);
  });
});
