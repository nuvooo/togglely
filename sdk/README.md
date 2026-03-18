# Togglely SDKs

Official JavaScript/TypeScript SDKs for [Togglely](https://togglely.io) feature flag management platform.

## Packages

| Package | Description | Framework |
|---------|-------------|-----------|
| [`@togglely/sdk-core`](./core) | Core SDK | Framework-agnostic |
| [`@togglely/sdk`](./vanilla) | Vanilla JS SDK | Browser / Node.js |
| [`@togglely/sdk-react`](./react) | React SDK | React |
| [`@togglely/sdk-vue`](./vue) | Vue SDK | Vue 3 |
| [`@togglely/sdk-svelte`](./svelte) | Svelte SDK | Svelte |

## Quick Start

### React

```bash
npm install @togglely/sdk-react
```

```tsx
import { TogglelyProvider, useToggle } from '@togglely/sdk-react';

function App() {
  return (
    <TogglelyProvider 
      apiKey="your-api-key"
      project="my-project"
      environment="production"
      baseUrl="https://togglely.io"
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

### Vue

```bash
npm install @togglely/sdk-vue
```

```typescript
import { createApp } from 'vue';
import { createTogglely } from '@togglely/sdk-vue';

const app = createApp(App);
app.use(createTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
}));
```

```vue
<script setup>
import { useToggle } from '@togglely/sdk-vue';
const isEnabled = useToggle('new-feature', false);
</script>

<template>
  <NewFeature v-if="isEnabled" />
  <OldFeature v-else />
</template>
```

### Svelte

```bash
npm install @togglely/sdk-svelte
```

```svelte
<script>
  import { initTogglely, toggle } from '@togglely/sdk-svelte';
  
  initTogglely({
    apiKey: 'your-api-key',
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  });
  
  const isEnabled = toggle('new-feature', false);
</script>

{#if $isEnabled}
  <NewFeature />
{:else}
  <OldFeature />
{/if}
```

### Vanilla JS

```bash
npm install @togglely/sdk
```

```javascript
import { initTogglely, isEnabled } from '@togglely/sdk';

initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
});

const enabled = await isEnabled('new-feature', false);
```

Or via CDN:

```html
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
<script>
  Togglely.initTogglely({ apiKey: 'your-api-key', ... });
</script>
```

## Key Features

### 🏢 Multi-Brand / Multi-Tenant Support

For projects with multiple brands or tenants:

```typescript
// React
<TogglelyProvider tenantId="brand-a" ...>

// Vue
app.use(createTogglely({ tenantId: 'brand-a', ... }));

// Core
const client = new TogglelyClient({ tenantId: 'brand-a', ... });
```

### 💾 Offline Fallback

All SDKs support multiple offline fallback methods:

1. **Inline Toggles** - Pass toggles directly in config
2. **JSON File** - Load from a JSON file path
3. **Environment Variables** - Node.js (`TOGGLELY_*`)
4. **Window Object** - Browser (`window.__TOGGLELY_TOGGLES`)

### 🔧 Build-Time JSON Generation

Generate offline JSON during build:

```bash
npx @togglely/sdk-core togglely-pull \
  --apiKey=your-api-key \
  --project=my-project \
  --environment=production \
  --output=./toggles.json
```

Or add to your build script:

```json
{
  "scripts": {
    "build": "togglely-pull && vite build"
  }
}
```

### 🎯 Targeting Context

Set user context for advanced targeting:

```typescript
// React
const client = useTogglelyClient();
client.setContext({ userId: '123', country: 'DE' });

// Vue
const { setContext } = useTogglelyContext();
setContext({ userId: '123', country: 'DE' });

// Core
client.setContext({ userId: '123', country: 'DE' });
```

## Documentation

- [Core SDK Documentation](./core/README.md)
- [React SDK Documentation](./react/README.md)
- [Vue SDK Documentation](./vue/README.md)
- [Svelte SDK Documentation](./svelte/README.md)
- [Vanilla JS SDK Documentation](./vanilla/README.md)

## License

MIT
