# @togglely/sdk-core

Core SDK for Togglely - Framework agnostic feature toggles.

## Installation

```bash
npm install @togglely/sdk-core
```

## Usage

```typescript
import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com'
});

// Check if feature is enabled
const isEnabled = await client.isEnabled('new-feature', false);

// Get string value
const message = await client.getString('welcome-message', 'Hello');

// Get number value
const limit = await client.getNumber('max-items', 10);

// Get JSON value
const config = await client.getJSON('app-config', {});

// Listen to events
client.on('ready', () => console.log('Toggles loaded!'));
client.on('offline', () => console.log('Using offline toggles'));
```

## Offline Mode

The SDK automatically falls back to environment variables when the service is unavailable.

### Environment Variables

```bash
TOGGLELY_NEW_FEATURE=true
TOGGLELY_MAX_ITEMS=100
```

### Browser Global

```html
<script>
  window.__TOGGLELY_TOGGLES = {
    'new-feature': true,
    'max-items': 100
  };
</script>
```

## API

### `TogglelyClient(config)`

Creates a new Togglely client.

**Config options:**
- `apiKey` (string, required): Your API key
- `environment` (string, required): Environment name
- `baseUrl` (string, required): Togglely instance URL
- `refreshInterval` (number, default: 60000): Polling interval in ms
- `timeout` (number, default: 5000): Request timeout in ms
- `offlineFallback` (boolean, default: true): Enable offline mode
- `envPrefix` (string, default: 'TOGGLELY_'): Environment variable prefix

### Methods

- `isEnabled(key, defaultValue)`: Check if a boolean toggle is enabled
- `getString(key, defaultValue)`: Get a string toggle value
- `getNumber(key, defaultValue)`: Get a number toggle value
- `getJSON(key, defaultValue)`: Get a JSON toggle value
- `getAllToggles()`: Get all toggles
- `setContext(context)`: Set evaluation context (userId, email, etc.)
- `refresh()`: Manually refresh toggles
- `destroy()`: Cleanup and stop polling
- `on(event, handler)`: Listen to events ('ready', 'update', 'error', 'offline', 'online')
