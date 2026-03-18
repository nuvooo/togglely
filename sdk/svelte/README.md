# Togglely Svelte SDK

Svelte stores and actions for [Togglely](https://togglely.io) feature flag management.

## Features

- 🎣 **Svelte Stores** - `toggle`, `stringToggle`, `numberToggle`, `jsonToggle`
- 🎯 **Actions** - `use:featureToggle` for declarative UI
- 💾 **Offline Support** - Built-in offline fallback
- 🔒 **TypeScript** - Full type safety
- ⚡ **Reactive** - Automatic updates with Svelte's reactivity

## Installation

```bash
npm install @togglely/sdk-svelte
```

## Quick Start

```svelte
<!-- App.svelte -->
<script>
  import { initTogglely, toggle } from '@togglely/sdk-svelte';
  
  // Initialize once (usually in your root layout)
  initTogglely({
    apiKey: 'your-api-key',
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  });
  
  // Use the store
  const isEnabled = toggle('new-feature', false);
</script>

{#if $isEnabled}
  <NewFeature />
{:else}
  <OldFeature />
{/if}
```

## Initialization

```typescript
import { initTogglely, getTogglelyClient, destroyTogglely } from '@togglely/sdk-svelte';

// Initialize
initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  tenantId: 'brand-a',              // For multi-brand projects
  offlineJsonPath: '/toggles.json', // Offline fallback
});

// Access client directly
const client = getTogglelyClient();

// Cleanup on app destroy
destroyTogglely();
```

## Stores

### toggle

Boolean toggle store:

```svelte
<script>
  import { toggle } from '@togglely/sdk-svelte';
  const isEnabled = toggle('new-feature', false);
</script>

{#if $isEnabled}
  <div>New Feature!</div>
{/if}
```

### stringToggle

String toggle store:

```svelte
<script>
  import { stringToggle } from '@togglely/sdk-svelte';
  const message = stringToggle('welcome-message', 'Hello!');
</script>

<h1>{$message}</h1>
```

### numberToggle

Number toggle store:

```svelte
<script>
  import { numberToggle } from '@togglely/sdk-svelte';
  const limit = numberToggle('max-items', 10);
</script>

<p>Max items: {$limit}</p>
```

### jsonToggle

JSON toggle store:

```svelte
<script>
  import { jsonToggle } from '@togglely/sdk-svelte';
  const config = jsonToggle('app-config', { theme: 'dark' });
</script>

<div data-theme={$config.theme}>
  Content
</div>
```

### toggles

All toggles store:

```svelte
<script>
  import { toggles } from '@togglely/sdk-svelte';
  const all = toggles();
</script>

{#each Object.entries($all) as [key, toggle]}
  <p>{key}: {toggle.enabled ? 'ON' : 'OFF'}</p>
{/each}
```

### togglelyState

SDK state store:

```svelte
<script>
  import { togglelyState } from '@togglely/sdk-svelte';
  const state = togglelyState();
</script>

{#if !$state.isReady}
  <p>Loading...</p>
{:else if $state.isOffline}
  <p>Offline mode</p>
{/if}
```

## Actions

### featureToggle

```svelte
<script>
  import { featureToggle } from '@togglely/sdk-svelte';
</script>

<div use:featureToggle={'new-feature'}>
  Only visible when enabled
</div>
```

## Context

```typescript
import { setTogglelyContext, getTogglelyContext, clearTogglelyContext } from '@togglely/sdk-svelte';

// Set targeting context
setTogglelyContext({ userId: '123', country: 'DE' });

// Get current context
const context = getTogglelyContext();

// Clear context
clearTogglelyContext();
```

## SSR (SvelteKit)

```typescript
// src/lib/togglely.ts
import { initTogglely } from '@togglely/sdk-svelte';

export function loadTogglely() {
  initTogglely({
    apiKey: import.meta.env.VITE_TOGGLELY_APIKEY,
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  });
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { browser } from '$app/environment';
  import { initTogglely } from '@togglely/sdk-svelte';
  
  if (browser) {
    initTogglely({
      apiKey: import.meta.env.VITE_TOGGLELY_APIKEY,
      project: 'my-project',
      environment: 'production',
      baseUrl: 'https://togglely.io',
    });
  }
</script>

<slot />
```

## Build-Time JSON Generation

```json
{
  "scripts": {
    "build": "togglely-pull --apiKey=$TOGGLELY_APIKEY --project=my-project --environment=production --output=./static/toggles.json && vite build"
  }
}
```

```typescript
// app.ts
initTogglely({
  apiKey: 'your-api-key',
  project: 'my-project',
  environment: 'production',
  baseUrl: 'https://togglely.io',
  offlineJsonPath: '/toggles.json',
});
```

## FeatureToggle Component Example

Create your own wrapper component:

```svelte
<!-- FeatureToggle.svelte -->
<script>
  import { toggle } from '@togglely/sdk-svelte';
  
  export let name;
  export let defaultValue = false;
  
  const isEnabled = toggle(name, defaultValue);
</script>

{#if $isEnabled}
  <slot />
{:else}
  <slot name="fallback" />
{/if}
```

```svelte
<!-- Usage -->
<FeatureToggle name="new-feature">
  <NewVersion />
  <svelte:fragment slot="fallback">
    <OldVersion />
  </svelte:fragment>
</FeatureToggle>
```

## License

MIT
