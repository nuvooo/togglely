# @togglely/sdk-svelte

Svelte SDK for Togglely - Feature toggles with stores.

## Installation

```bash
npm install @togglely/sdk-svelte
```

## Usage

### Initialize

```svelte
<script>
  import { initTogglely } from '@togglely/sdk-svelte';
  
  initTogglely({
    apiKey: 'your-api-key',
    environment: 'production',
    baseUrl: 'https://your-togglely-instance.com'
  });
</script>
```

### Stores

#### `toggle(key, defaultValue)`

Check if a boolean feature toggle is enabled:

```svelte
<script>
  import { toggle } from '@togglely/sdk-svelte';
  
  const isEnabled = toggle('new-feature', false);
</script>

{#if $isEnabled}
  <NewFeature />
{:else}
  <OldFeature />
{/if}
```

#### `stringToggle(key, defaultValue)`

Get a string toggle value:

```svelte
<script>
  const message = stringToggle('welcome-message', 'Hello');
</script>

<p>{$message}</p>
```

#### `numberToggle(key, defaultValue)`

Get a number toggle value:

```svelte
<script>
  const limit = numberToggle('max-items', 10);
</script>

<p>Max items: {$limit}</p>
```

#### `jsonToggle(key, defaultValue)`

Get a JSON toggle value:

```svelte
<script>
  const config = jsonToggle('app-config', { theme: 'light' });
</script>

<p>Theme: {$config.theme}</p>
```

#### `toggles()`

Get all toggles:

```svelte
<script>
  const allToggles = toggles();
</script>

{#each Object.entries($allToggles) as [key, toggle]}
  <p>{key}: {toggle.value}</p>
{/each}
```

#### `togglelyState()`

Get the SDK state:

```svelte
<script>
  const state = togglelyState();
</script>

{#if $state.isOffline}
  <p>Using offline mode</p>
{/if}
```

### Action

Use the `featureToggle` action to show/hide elements:

```svelte
<script>
  import { featureToggle } from '@togglely/sdk-svelte';
</script>

<div use:featureToggle={'new-feature'}>
  Only visible when toggle is enabled
</div>
```

### Context

```svelte
<script>
  import { setTogglelyContext } from '@togglely/sdk-svelte';
  
  setTogglelyContext({ userId: '123', email: 'user@example.com' });
</script>
```
