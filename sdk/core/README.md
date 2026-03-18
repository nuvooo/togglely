# Togglely Core SDK

Framework-agnostic core SDK for [Togglely](https://togglely.io) feature flag management with offline support and multi-brand/tenant capabilities.

## Features

- 🚀 **Real-time flag evaluation** - Fetch flags from your Togglely instance
- 💾 **Offline-first support** - JSON file, environment variables, or inline fallback
- 🏢 **Multi-brand/tenant** - Support for multi-tenant projects
- 🔒 **Type-safe** - Full TypeScript support
- ⚡ **Lightweight** - Minimal bundle size
- 🔧 **CLI tool** - Build-time JSON generation for offline deployment

## Installation

```bash
npm install @togglely/sdk-core
```

## Quick Start

```typescript
import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
});

// Check if a feature is enabled
const isEnabled = await client.isEnabled('new-feature');
if (isEnabled) {
  // Show new feature
}

// Get typed values
const message = await client.getString('welcome-message', 'Hello!');
const timeout = await client.getNumber('api-timeout', 5000);
const config = await client.getJSON('app-config', { theme: 'dark' });
```

## Configuration

```typescript
interface TogglelyConfig {
  apiKey: string;           // Your API key from Togglely dashboard
  project: string;          // Project key
  environment: string;      // Environment key (e.g., 'development', 'production')
  baseUrl: string;          // Your Togglely instance URL
  timeout?: number;         // Request timeout in ms (default: 5000)
  offlineFallback?: boolean; // Enable offline fallback (default: true)
  offlineJsonPath?: string; // Path to offline JSON file
  offlineToggles?: object;  // Inline offline toggles
  brandKey?: string;        // Brand key for multi-brand projects
  tenantId?: string;        // Tenant ID (alias for brandKey)
  context?: object;         // Initial targeting context
}
```

## Multi-Brand / Multi-Tenant Support

For projects with multiple brands or tenants:

```typescript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: 'brand-a',  // or brandKey: 'brand-a'
});
```

## Offline Fallback

The SDK supports multiple offline fallback methods (in priority order):

### 1. Inline Toggles (Config)

```typescript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  offlineToggles: {
    'new-feature': { value: true, enabled: true },
    'api-timeout': { value: 5000, enabled: true, flagType: 'NUMBER' },
  },
});
```

### 2. JSON File

Generate a JSON file at build time (see CLI section below):

```typescript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  offlineJsonPath: '/toggles.json',  // Will be fetched if API fails
});
```

### 3. Environment Variables (Node.js)

```bash
TOGGLELY_NEW_FEATURE=true
TOGGLELY_API_TIMEOUT=5000
```

```typescript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  envPrefix: 'TOGGLELY_',  // Default prefix
});
```

### 4. Window Object (Browser)

```html
<script>
  window.__TOGGLELY_TOGGLES = {
    'new-feature': { value: true, enabled: true },
    'api-timeout': { value: 5000, enabled: true },
  };
</script>
```

## Build-Time JSON Generation (CLI)

Install the CLI tool globally or use npx:

```bash
# Install globally
npm install -g @togglely/sdk-core

# Or use with npx
npx @togglely/sdk-core togglely-pull --apiKey=xxx --project=xxx --environment=xxx
```

### CLI Usage

```bash
# Basic usage
togglely-pull \
  --apiKey=tk_your_api_key \
  --project=my-project \
  --environment=production \
  --output=./public/toggles.json

# With tenant/brand
togglely-pull \
  --apiKey=tk_your_api_key \
  --project=my-project \
  --environment=production \
  --tenantId=brand-a \
  --output=./toggles.json

# Different output formats
togglely-pull --format=json  # JSON file (default)
togglely-pull --format=env   # .env file
togglely-pull --format=js    # JavaScript module

# Using environment variables
export TOGGLELY_APIKEY=tk_your_api_key
export TOGGLELY_PROJECT=my-project
export TOGGLELY_ENVIRONMENT=production
togglely-pull --output=./toggles.json

# Using config file
togglely-pull --config=./togglely.config.js
```

### Config File (togglely.config.js)

```javascript
module.exports = {
  apiKey: process.env.TOGGLELY_APIKEY,
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: process.env.BRAND_KEY,
  output: './public/toggles.json',
  format: 'json',
};
```

### Build Script Integration

Add to your build process:

```json
{
  "scripts": {
    "build": "togglely-pull && vite build",
    "build:staging": "togglely-pull --environment=staging && vite build",
    "build:prod": "togglely-pull --environment=production && vite build"
  }
}
```

## Targeting Context

Set user context for advanced targeting rules:

```typescript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  context: {
    userId: 'user-123',
    email: 'user@example.com',
    country: 'DE',
    region: 'EU',
  },
});

// Or update context later
client.setContext({
  userId: 'user-456',
  country: 'US',
});
```

## Events

Listen to SDK events:

```typescript
// When flags are first loaded
client.on('ready', (state) => {
  console.log('Togglely is ready!');
});

// When flags are updated
client.on('update', (state) => {
  console.log('Flags updated!');
});

// When going offline
client.on('offline', (state) => {
  console.log('Using offline mode');
});

// When coming back online
client.on('online', (state) => {
  console.log('Back online!');
});

// On error
client.on('error', (state) => {
  console.error('Error:', state.lastError);
});
```

## API Reference

### Methods

- `isEnabled(key, defaultValue?)` - Check boolean flag
- `getString(key, defaultValue?)` - Get string value
- `getNumber(key, defaultValue?)` - Get number value
- `getJSON(key, defaultValue?)` - Get JSON value
- `getValue(key)` - Get raw toggle value
- `getAllToggles()` - Get all cached toggles
- `setContext(context)` - Set targeting context
- `getContext()` - Get current context
- `refresh()` - Manually refresh flags
- `on(event, handler)` - Subscribe to events
- `off(event, handler)` - Unsubscribe from events
- `destroy()` - Cleanup

### State

- `isReady()` - Check if initial load completed
- `isOffline()` - Check if in offline mode
- `getState()` - Get full state object

## License

MIT
