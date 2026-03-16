# @togglely/sdk-react

React SDK for Togglely - Feature toggles with hooks.

No automatic polling - manual refresh or use WebSockets for real-time updates.

## Installation

```bash
npm install @togglely/sdk-react
```

## Usage

### Provider

Wrap your app with `TogglelyProvider`. You can provide an `initialContext` for multi-tenant setups:

```tsx
import { TogglelyProvider } from '@togglely/sdk-react';

function App() {
  return (
    <TogglelyProvider 
      apiKey="your-api-key"
      project="web-app"
      environment="production"
      baseUrl="https://your-togglely-instance.com"
      initialContext={{ 
        tenantId: 'customer-123', 
        plan: 'premium' 
      }}
    >
      <MyApp />
    </TogglelyProvider>
  );
}
```

### Server Side Rendering (SSR) & Next.js

For SSR, use `getTogglelyState` to fetch toggles before the page renders:

```tsx
// Next.js getServerSideProps example
import { getTogglelyState } from '@togglely/sdk-react';

export async function getServerSideProps() {
  const toggles = await getTogglelyState({
    apiKey: process.env.TOGGLELY_API_KEY,
    project: 'web-app',
    environment: 'production',
    baseUrl: 'https://your-togglely-instance.com'
  }, { 
    tenantId: 'customer-123' 
  });

  return { props: { initialToggles: toggles } };
}

// Then pass to Provider to avoid flickering
<TogglelyProvider initialToggles={props.initialToggles} ...>
```

### Hooks

#### `useTogglelyClient()`

Access the core client to update context dynamically:

```tsx
function LoginComponent() {
  const client = useTogglelyClient();

  const handleLogin = (user) => {
    client.setContext({ 
      userId: user.id, 
      tenantId: user.companyId 
    });
  };
}
```

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
