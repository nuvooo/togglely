# Togglely SDK Integration Tests

These integration tests verify the SDK functionality against a real Togglely backend running in Docker.

## Test Structure

### `integration.test.ts`
Core integration tests that verify:
- **Basic Connectivity**: SDK can connect and fetch flags from the backend
- **CORS Origin Validation**: Requests work with proper origin settings
- **Multi-Tenant Brand Resolution**: Brand-specific flags are fetched correctly
- **SDK Event Handling**: Events (ready, error, update) are fired correctly
- **Refresh and Updates**: Manual refresh and context updates work

### `cors-security.test.ts`
Security-focused tests that verify:
- **Origin Allowlist**: Only allowed origins can access flags
- **Wildcard Support**: `['*']` allows all origins
- **Empty List**: `[]` allows all origins (backward compatibility)
- **API Key Security**: Keys are handled securely

## Prerequisites

1. Docker and Docker Compose installed
2. Backend containers running:
   ```bash
   cd /path/to/flagify
   docker-compose up -d
   ```

3. Demo data seeded (happens automatically on container start)

## Running Tests

### Run all integration tests:
```bash
npm run test:integration
```

### Run specific test file:
```bash
npx jest --config jest.integration.config.js integration.test.ts
```

### Run with verbose output:
```bash
npx jest --config jest.integration.config.js --verbose
```

### Run specific test:
```bash
npx jest --config jest.integration.config.js --testNamePattern="should successfully connect"
```

## Test Configuration

Tests use the demo data automatically created by the backend:

| Project | API Key | Type |
|---------|---------|------|
| Simple Web App | `togglely_demo_simple_key` | Single Tenant |
| Multi-Tenant SaaS | `togglely_demo_saas_key` | Multi-Tenant |
| Orbit | `togglely_wE5wkv6gZr3cr5eZmLJ5O12IwfB2wwNcKSFqlxKy8vPHe9hw` | Multi-Tenant |

## Environment Variables

You can override test settings with environment variables:

```bash
# Use different backend URL
TEST_API_URL=http://localhost:4000 npm run test:integration

# Use different credentials
TEST_API_KEY=your-key TEST_PROJECT=your-project npm run test:integration
```

## Troubleshooting

### "Backend is not accessible"
- Ensure Docker containers are running: `docker-compose ps`
- Check backend logs: `docker-compose logs backend`
- Verify port 4000 is not blocked by firewall

### "Failed to get admin token" (CORS Security Tests)
- The CORS security tests need admin access to create test projects
- Ensure demo user exists: `demo@togglely.io` / `demo123!`
- Check that admin API is accessible at `/api/auth/login`

### Tests timeout
- Increase timeout: `--testTimeout=60000`
- Check if backend is overloaded: `docker stats`

## Security Notes

These tests verify that:
1. **CORS is enforced** - Requests from unauthorized origins are rejected
2. **API keys are required** - Invalid keys result in 401 errors
3. **Offline fallback works** - SDK gracefully handles backend failures
4. **Brand isolation** - Multi-tenant projects correctly isolate brand data

The demo projects use `allowedOrigins: []` (empty array) which allows all origins for easier testing. In production, you should set specific allowed origins in Project Settings > SDK Security.
