# Togglely Vanilla JavaScript SDK

Vanilla JavaScript SDK for [Togglely](https://togglely.io) feature flag management. Works in browsers and Node.js without any framework.

## Features

- 🌍 **Universal** - Works in browser and Node.js
- 📦 **Zero dependencies** - Lightweight and fast
- 💾 **Offline support** - JSON file, environment variables, or window object
- 🎯 **Simple API** - Easy to use with global instance
- 🔒 **TypeScript** - Full type support

## Installation

### NPM

```bash
npm install @togglely/sdk
```

### CDN

```html
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
```

## Quick Start

### Browser (Module)

```javascript
import { initTogglely, isEnabled } from '@togglely/sdk';

// Initialize
initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
});

// Use global helpers
const newFeature = await isEnabled('new-feature', false);
if (newFeature) {
  document.getElementById('new-feature').style.display = 'block';
}
```

### Browser (CDN)

```html
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
<script>
  Togglely.initTogglely({
    apiKey: 'your-api-key',
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  });
  
  Togglely.isEnabled('new-feature').then(function(enabled) {
    if (enabled) {
      document.getElementById('new-feature').style.display = 'block';
    }
  });
</script>
```

### Node.js

```javascript
const { TogglelyClient } = require('@togglely/sdk');

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
});

const isEnabled = await client.isEnabled('new-feature', false);
console.log('New feature:', isEnabled);
```

## Configuration

```javascript
initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: 'brand-a',              // For multi-brand projects
  offlineJsonPath: '/toggles.json', // Offline fallback
  timeout: 5000,                    // Request timeout
});
```

## Global Helpers

After calling `initTogglely()`, you can use these global helpers:

```javascript
import { isEnabled, getString, getNumber, getJSON } from '@togglely/sdk';

// Boolean toggle
const enabled = await isEnabled('new-feature', false);

// String toggle
const message = await getString('welcome-message', 'Hello!');

// Number toggle
const limit = await getNumber('max-items', 10);

// JSON toggle
const config = await getJSON('app-config', { theme: 'dark' });
```

## DOM Helpers

### togglelyToggle

Show/hide elements based on a toggle:

```javascript
import { togglelyToggle } from '@togglely/sdk';

// Show element when toggle is enabled
await togglelyToggle('#new-feature', 'new-feature');

// Hide element when toggle is disabled (invert)
await togglelyToggle('#old-feature', 'new-feature', { invert: true });

// With default value
await togglelyToggle('#beta', 'beta-feature', { defaultValue: true });
```

### togglelyInit

Initialize multiple elements:

```javascript
import { togglelyInit } from '@togglely/sdk';

const unsubscribe = togglelyInit({
  // Simple selectors
  'new-feature': ['.new-feature', '.new-banner'],
  
  // With options
  'premium': { 
    selector: '.premium-content', 
    defaultValue: false 
  },
  
  // Invert (hide when enabled)
  'new-ui': {
    selector: '.old-ui',
    invert: true
  }
});

// Cleanup
unsubscribe();
```

## Offline Fallback

### Environment Variables (Node.js)

```bash
TOGGLELY_NEW_FEATURE=true
TOGGLELY_MAX_ITEMS=100
TOGGLELY_WELCOME_MESSAGE="Hello World"
```

```javascript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  envPrefix: 'TOGGLELY_',  // Default
});
```

### Window Object (Browser)

```html
<script>
  window.__TOGGLELY_TOGGLES = {
    'new-feature': { value: true, enabled: true },
    'max-items': { value: 100, enabled: true },
    'welcome-message': { value: 'Hello World', enabled: true }
  };
</script>
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
```

### JSON File

Generate offline JSON:

```bash
togglely-pull --apiKey=xxx --project=my-project --environment=production --output=./toggles.json
```

Use in your app:

```javascript
initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  offlineJsonPath: '/toggles.json',
});
```

## Direct Client Usage

For more control, use the client directly:

```javascript
import { TogglelyClient } from '@togglely/sdk';

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: 'brand-a',
});

// Set targeting context
client.setContext({ userId: '123', country: 'DE' });

// Check toggle
const enabled = await client.isEnabled('new-feature', false);

// Listen to events
client.on('ready', () => console.log('Ready!'));
client.on('offline', () => console.log('Offline mode'));
client.on('update', () => console.log('Toggles updated'));

// Get all toggles
const all = client.getAllToggles();

// Cleanup
client.destroy();
```

## Build-Time JSON Generation

```json
{
  "scripts": {
    "build": "togglely-pull --apiKey=$TOGGLELY_APIKEY --project=my-project --environment=production --output=./toggles.json"
  }
}
```

## License

MIT
