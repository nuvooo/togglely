# @togglely/sdk-vue

Vue 3 SDK for Togglely - Feature toggles with composables.

## Installation

```bash
npm install @togglely/sdk-vue
```

## Usage

### Plugin

```typescript
import { createApp } from 'vue';
import { createTogglely } from '@togglely/sdk-vue';
import App from './App.vue';

const app = createApp(App);

app.use(createTogglely({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com'
}));

app.mount('#app');
```

### Composables

#### `useToggle(key, defaultValue)`

Check if a boolean feature toggle is enabled:

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

#### `useStringToggle(key, defaultValue)`

Get a string toggle value:

```vue
<script setup>
const message = useStringToggle('welcome-message', 'Hello');
</script>

<template>
  <p>{{ message }}</p>
</template>
```

#### `useNumberToggle(key, defaultValue)`

Get a number toggle value:

```vue
<script setup>
const limit = useNumberToggle('max-items', 10);
</script>
```

#### `useJSONToggle(key, defaultValue)`

Get a JSON toggle value:

```vue
<script setup>
const config = useJSONToggle('app-config', { theme: 'light' });
</script>
```

#### `useToggles()`

Get all toggles:

```vue
<script setup>
const toggles = useToggles();
// toggles is a readonly ref
</script>
```

#### `useTogglelyState()`

Get the SDK state:

```vue
<script setup>
const state = useTogglelyState();
// state.value = { isReady, isOffline, lastError, lastFetch }
</script>

<template>
  <p v-if="state.isOffline">Offline mode</p>
</template>
```

### Directive

Register the directive:

```typescript
import { vFeatureToggle } from '@togglely/sdk-vue';

app.directive('feature-toggle', vFeatureToggle);
```

Use in templates:

```vue
<template>
  <div v-feature-toggle="'new-feature'">
    Only visible when toggle is enabled
  </div>
  
  <div v-feature-toggle="{ toggle: 'premium', defaultValue: false }">
    Premium content
  </div>
</template>
```

### Context

```vue
<script setup>
import { useTogglelyContext } from '@togglely/sdk-vue';

const { setContext, clearContext, getContext } = useTogglelyContext();

setContext({ userId: '123', email: 'user@example.com' });
</script>
```
