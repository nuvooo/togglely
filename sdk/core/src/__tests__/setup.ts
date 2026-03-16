// Test setup
global.fetch = jest.fn();

// Mock process.env
process.env.TOGGLELY_TEST_FEATURE = 'true';
process.env.TOGGLELY_API_URL = 'https://api.test.com';
