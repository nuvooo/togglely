# Cypress E2E Tests for Flagify

## Overview

This directory contains comprehensive end-to-end tests for the Flagify Feature Flag Management Platform. The tests cover all major functionality including authentication, organizations, projects, feature flags, API keys, and settings.

## Test Structure

```
cypress/
├── e2e/
│   ├── auth.cy.ts          # Authentication tests (login, register, logout)
│   ├── organizations.cy.ts # Organization management tests
│   ├── projects.cy.ts      # Project management tests
│   ├── feature-flags.cy.ts # Feature flag tests (CRUD, toggle, targeting)
│   ├── api-keys.cy.ts      # API key management tests
│   ├── settings.cy.ts      # User settings tests
│   └── dashboard.cy.ts     # Dashboard tests
├── support/
│   └── e2e.ts              # Custom commands and utilities
└── fixtures/               # Test data (if needed)
```

## Running Tests

### Open Cypress Test Runner (Interactive)

```bash
npm run test:open
```

### Run All Tests (Headless)

```bash
npm run test
```

### Run Tests with Coverage Check

```bash
npm run test:coverage
```

## Test Coverage

The test suite aims for **minimum 80% code coverage** across:
- Lines
- Functions
- Branches
- Statements

### Coverage Report

After running tests, view the coverage report:

```bash
npm run coverage
```

Or open `coverage/index.html` in your browser.

## Custom Commands

### `cy.login(email, password)`
Logs in a user and creates a session.

```typescript
cy.login('demo@flagify.io', 'demo1234')
```

### `cy.createOrganization(name)`
Creates a new organization.

```typescript
cy.createOrganization('My Test Org')
```

### `cy.createProject(orgId, name)`
Creates a new project in an organization.

```typescript
cy.createProject('org-id-here', 'My Project')
```

### `cy.createFeatureFlag(projectId, name, key)`
Creates a new feature flag in a project.

```typescript
cy.createFeatureFlag('project-id', 'Dark Mode', 'dark-mode')
```

## Test Data

Tests use the following demo credentials:
- Email: `demo@flagify.io`
- Password: `demo1234`

These are seeded automatically when the backend starts with `prisma db seed`.

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main`

See `.github/workflows/cypress.yml` for the GitHub Actions configuration.

## Writing New Tests

1. Create a new file in `cypress/e2e/` with the `.cy.ts` extension
2. Use descriptive test names
3. Follow the Arrange-Act-Assert pattern
4. Add custom commands to `support/e2e.ts` if needed
5. Ensure tests clean up after themselves

## Troubleshooting

### Tests fail due to timeouts
Increase the timeout in `cypress.config.ts`:
```typescript
e2e: {
  defaultCommandTimeout: 10000,
  pageLoadTimeout: 10000,
}
```

### Element not found
Use `data-testid` attributes for more reliable selectors:
```tsx
<button data-testid="create-flag-btn">Create Flag</button>
```
Then select with:
```typescript
cy.get('[data-testid="create-flag-btn"]').click()
```

### Flaky tests
Avoid hardcoded waits. Use assertions to wait for elements:
```typescript
cy.contains('Success').should('be.visible')
```

## Best Practices

1. **Don't use hardcoded waits** - Use assertions instead
2. **Clean up test data** - Delete created resources after tests
3. **Use custom commands** - For repetitive actions
4. **Test user journeys** - Not just individual features
5. **Run tests in CI** - Before merging code
