# @togglely/sdk-react

React SDK for Togglely - Feature toggles with hooks.

## Installation

```bash
npm install @togglely/sdk-react
```

## Usage

### Provider

Wrap your app with `TogglelyProvider`:

```tsx
import { TogglelyProvider } from '@togglely/sdk-react';

function App() {
  return (
    <TogglelyProvider 
      apiKey="your-api-key"
      environment="production"
      baseUrl="https://your-togglely-instance.com"
    >
      <MyApp />
    </TogglelyProvider>
  );
}
```

### Hooks

#### `useToggle(key, defaultValue)`

Check if a boolean feature toggle is enabled:

```tsx
function MyComponent() {
  const isEnabled = useToggle('new-feature', false);
  return isEnabled ? <NewFeature /> : <OldFeature />;
}
```

#### `useStringToggle(key, defaultValue)`

Get a string toggle value:

```tsx
const message = useStringToggle('welcome-message', 'Hello');
```

#### `useNumberToggle(key, defaultValue)`

Get a number toggle value:

```tsx
const limit = useNumberToggle('max-items', 10);
```

#### `useJSONToggle(key, defaultValue)`

Get a JSON toggle value:

```tsx
const config = useJSONToggle('app-config', { theme: 'light' });
```

#### `useToggles()`

Get all toggles:

```tsx
const toggles = useToggles();
// toggles = { 'new-feature': { value: true, enabled: true }, ... }
```

#### `useTogglelyState()`

Get the SDK state:

```tsx
const state = useTogglelyState();
// state = { isReady: true, isOffline: false, lastError: null, lastFetch: Date }
```

### Components

#### `FeatureToggle`

Conditionally render content:

```tsx
import { FeatureToggle } from '@togglely/sdk-react';

<FeatureToggle toggle="new-feature" fallback={<OldFeature />}>
  <NewFeature />
</FeatureToggle>
```

### SSR Support

Pass initial toggles for server-side rendering:

```tsx
<TogglelyProvider 
  apiKey="your-api-key"
  environment="production"
  baseUrl="https://your-togglely-instance.com"
  initialToggles={{ 'new-feature': true }}
>
```
