# Togglely Vue SDK

Vue composables and directives for [Togglely](https://togglely.io) feature flag management.

## Features

- 🎣 **Vue Composables** - `useToggle`, `useStringToggle`, `useNumberToggle`, `useJSONToggle`
- 🎯 **Directives** - `v-feature-toggle` for declarative UI
- 💾 **Offline Support** - Built-in offline fallback
- 🔒 **TypeScript** - Full type safety
- ⚡ **Reactive** - Automatic updates when flags change

## Installation

```bash
npm install @togglely/sdk-vue
```

## Quick Start

```typescript
// main.ts
import { createApp } from 'vue';
import { createTogglely } from '@togglely/sdk-vue';
import App from './App.vue';

const app = createApp(App);

app.use(createTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
}));

app.mount('#app');
```

```vue
<!-- MyComponent.vue -->
<script setup>
import { useToggle, useStringToggle, useNumberToggle } from '@togglely/sdk-vue';

const isEnabled = useToggle('new-feature', false);
const message = useStringToggle('welcome-message', 'Hello!');
const limit = useNumberToggle('max-items', 10);
</script>

<template>
  <div v-if="isEnabled">
    <h1>{{ message }}</h1>
    <p>Max items: {{ limit }}</p>
  </div>
  <div v-else>
    Feature not available
  </div>
</template>
```

## Plugin Options

```typescript
app.use(createTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: 'brand-a',           // For multi-brand projects
  offlineJsonPath: '/toggles.json',
  offlineToggles: {              // Inline offline fallback
    'new-feature': { value: true, enabled: true },
  },
}));
```

## Composables

### useToggle

Reactive boolean toggle:

```typescript
const isEnabled = useToggle('new-feature', false);
// Ref<boolean>
```

### useStringToggle

Reactive string toggle:

```typescript
const message = useStringToggle('welcome-message', 'Hello!');
// Ref<string>
```

### useNumberToggle

Reactive number toggle:

```typescript
const limit = useNumberToggle('max-items', 10);
// Ref<number>
```

### useJSONToggle

Reactive JSON toggle:

```typescript
const config = useJSONToggle('app-config', { theme: 'dark' });
// Ref<YourType>
```

### useToggles

Get all toggles:

```typescript
const allToggles = useToggles();
// DeepReadonly<Ref<Record<string, ToggleValue>>>
```

### useTogglelyState

Get SDK state:

```typescript
const state = useTogglelyState();
// { isReady, isOffline, lastError, lastFetch }
```

### useTogglelyContext

Set targeting context:

```typescript
const { setContext, clearContext, getContext } = useTogglelyContext();

setContext({ userId: '123', country: 'DE' });
```

## Directives

### v-feature-toggle

```typescript
import { vFeatureToggle } from '@togglely/sdk-vue';

app.directive('feature-toggle', vFeatureToggle);
```

```vue
<template>
  <!-- Simple usage -->
  <div v-feature-toggle="'new-feature'">
    Only visible when enabled
  </div>
  
  <!-- With options -->
  <div v-feature-toggle="{ toggle: 'premium', defaultValue: false }">
    Premium content
  </div>
</template>
```

## SSR (Nuxt.js)

```typescript
// plugins/togglely.ts
import { createTogglely } from '@togglely/sdk-vue';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createTogglely({
    apiKey: process.env.TOGGLELY_APIKEY!,
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  }));
});
```

## Build-Time JSON Generation

```json
{
  "scripts": {
    "build": "togglely-pull --apiKey=$TOGGLELY_APIKEY --project=my-project --environment=production --output=./public/toggles.json && vite build"
  }
}
```

```typescript
// main.ts
app.use(createTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  offlineJsonPath: '/toggles.json',
}));
```

## License

MIT
