# Togglely SDKs

Official SDKs for Togglely - Feature Toggle Management System

## Packages

| Package | Framework | Install |
|---------|-----------|---------|
| `@togglely/sdk` | Vanilla JS / Universal | `npm install @togglely/sdk` |
| `@togglely/sdk-react` | React | `npm install @togglely/sdk-react` |
| `@togglely/sdk-svelte` | Svelte | `npm install @togglely/sdk-svelte` |
| `@togglely/sdk-vue` | Vue 3 | `npm install @togglely/sdk-vue` |
| `@togglely/sdk-core` | Core (Framework agnostic) | `npm install @togglely/sdk-core` |

## Features

- 🚀 **Multiple Framework Support** - React, Svelte, Vue, Vanilla JS
- 📴 **Offline Mode** - Automatic fallback to environment variables when service is unavailable
- 🔄 **Real-time Updates** - Automatic polling with event system
- 🌐 **SSR Support** - Server-side rendering compatible
- 🔧 **TypeScript** - Full TypeScript support
- 📦 **Lightweight** - Small bundle size

## Quick Start

### Vanilla JavaScript

```javascript
import { TogglelyClient } from '@togglely/sdk';

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com'
});

const isEnabled = await client.isEnabled('new-feature', false);
```

### React

```tsx
import { TogglelyProvider, useToggle } from '@togglely/sdk-react';

function App() {
  return (
    <TogglelyProvider 
      apiKey="your-api-key"
      environment="production"
      baseUrl="https://your-togglely-instance.com"
    >
      <MyComponent />
    </TogglelyProvider>
  );
}

function MyComponent() {
  const isEnabled = useToggle('new-feature', false);
  return isEnabled ? <NewFeature /> : <OldFeature />;
}
```

### Svelte

```svelte
<script>
  import { initTogglely, toggle } from '@togglely/sdk-svelte';
  
  initTogglely({
    apiKey: 'your-api-key',
    environment: 'production',
    baseUrl: 'https://your-togglely-instance.com'
  });
  
  const isEnabled = toggle('new-feature', false);
</script>

{#if $isEnabled}
  <NewFeature />
{:else}
  <OldFeature />
{/if}
```

### Vue

```vue
<script setup>
import { createTogglely } from '@togglely/sdk-vue';
import { useToggle } from '@togglely/sdk-vue';

const isEnabled = useToggle('new-feature', false);
</script>

<template>
  <div v-if="isEnabled">
    <NewFeature />
  </div>
  <div v-else>
    <OldFeature />
  </div>
</template>
```

## Offline Mode

All SDKs support automatic offline fallback to environment variables:

### Environment Variables (Node.js/Bun/Deno)

```bash
# Format: TOGGLELY_<TOGGLE_NAME>=<value>
TOGGLELY_NEW_FEATURE=true
TOGGLELY_MAX_ITEMS=100
TOGGLELY_WELCOME_MESSAGE="Hello World"
TOGGLELY_APP_CONFIG='{"theme":"dark","lang":"de"}'
```

### Browser (Inject into HTML)

```html
<script>
  window.__TOGGLELY_TOGGLES = {
    'new-feature': true,
    'max-items': 100,
    'welcome-message': 'Hello World',
    'app-config': { theme: 'dark', lang: 'de' }
  };
</script>
```

### Configuration

```javascript
const client = new TogglelyClient({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com',
  offlineFallback: true,  // Enable offline mode (default: true)
  envPrefix: 'TOGGLELY_'   // Environment variable prefix (default: 'TOGGLELY_')
});
```

## Events

All SDKs support event handling:

```javascript
client.on('ready', () => console.log('Toggles loaded'));
client.on('update', () => console.log('Toggles updated'));
client.on('error', () => console.log('Error occurred'));
client.on('offline', () => console.log('Using offline toggles'));
client.on('online', () => console.log('Back online'));
```

## License

MIT
