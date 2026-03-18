# Togglely React SDK

React hooks and components for [Togglely](https://togglely.io) feature flag management.

## Features

- 🎣 **React Hooks** - `useToggle`, `useStringToggle`, `useNumberToggle`, `useJSONToggle`
- 🏗️ **Components** - `FeatureToggle`, `FeatureToggleSwitch` for declarative UI
- ⚡ **SSR Support** - Works with Next.js, Remix, and other SSR frameworks
- 💾 **Offline Support** - Built-in offline fallback
- 🔒 **TypeScript** - Full type safety

## Installation

```bash
npm install @togglely/sdk-react
```

## Quick Start

```tsx
import { TogglelyProvider, useToggle, FeatureToggle } from '@togglely/sdk-react';

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
  // Using hook
  const isEnabled = useToggle('new-feature', false);
  
  return (
    <div>
      {isEnabled && <NewFeature />}
      
      {/* Or using component */}
      <FeatureToggle toggle="premium-feature" fallback={<FreeVersion />}>
        <PremiumVersion />
      </FeatureToggle>
    </div>
  );
}
```

## Provider Configuration

```tsx
<TogglelyProvider 
  apiKey="your-api-key"
  project="my-project"
  environment="production"
  baseUrl="https://togglely.io"
  tenantId="brand-a"              // For multi-brand projects
  offlineJsonPath="/toggles.json" // Offline fallback
  initialContext={{ userId: '123' }}
>
  {children}
</TogglelyProvider>
```

## Hooks

### useToggle

Check if a boolean feature is enabled:

```tsx
const isEnabled = useToggle('new-feature', false);
```

### useStringToggle

Get a string value:

```tsx
const message = useStringToggle('welcome-message', 'Hello!');
```

### useNumberToggle

Get a number value:

```tsx
const timeout = useNumberToggle('api-timeout', 5000);
```

### useJSONToggle

Get a JSON value:

```tsx
const config = useJSONToggle('app-config', { theme: 'dark' });
```

### useTogglelyClient

Access the client directly:

```tsx
const client = useTogglelyClient();
client.setContext({ userId: '123' });
```

### useTogglelyState

Get the current state:

```tsx
const { isReady, isOffline, lastError } = useTogglelyState();
```

## Components

### FeatureToggle

```tsx
<FeatureToggle 
  toggle="new-feature"
  fallback={<OldVersion />}
  defaultValue={false}
>
  <NewVersion />
</FeatureToggle>
```

### FeatureToggleSwitch

```tsx
<FeatureToggleSwitch toggle="plan-type" defaultValue="free">
  <FeatureToggleCase when="premium">
    <PremiumFeatures />
  </FeatureToggleCase>
  <FeatureToggleCase when="pro">
    <ProFeatures />
  </FeatureToggleCase>
  <FeatureToggleCase>
    <FreeFeatures />
  </FeatureToggleCase>
</FeatureToggleSwitch>
```

## Server-Side Rendering (SSR)

### Next.js App Router

```tsx
// app/layout.tsx
import { TogglelyProvider } from '@togglely/sdk-react';

export default async function RootLayout({ children }) {
  // Fetch toggles on server
  const response = await fetch(
    `https://togglely.io/sdk/flags/my-project/production?apiKey=${process.env.TOGGLELY_APIKEY}`
  );
  const initialToggles = await response.json();
  
  return (
    <html>
      <body>
        <TogglelyProvider 
          apiKey={process.env.TOGGLELY_APIKEY!}
          project="my-project"
          environment="production"
          baseUrl="https://togglely.io"
          initialToggles={initialToggles}
        >
          {children}
        </TogglelyProvider>
      </body>
    </html>
  );
}
```

### Next.js Pages Router

```tsx
// pages/index.tsx
import { TogglelyProvider, getTogglelyState } from '@togglely/sdk-react';

export async function getServerSideProps() {
  const initialToggles = await getTogglelyState({
    apiKey: process.env.TOGGLELY_APIKEY!,
    project: 'my-project',
    environment: 'production',
    baseUrl: 'https://togglely.io',
  });
  
  return { props: { initialToggles } };
}

export default function Page({ initialToggles }) {
  return (
    <TogglelyProvider 
      apiKey={process.env.TOGGLELY_APIKEY!}
      project="my-project"
      environment="production"
      baseUrl="https://togglely.io"
      initialToggles={initialToggles}
    >
      <MyComponent />
    </TogglelyProvider>
  );
}
```

## Build-Time JSON Generation

Generate offline JSON during build:

```json
{
  "scripts": {
    "build": "togglely-pull --apiKey=$TOGGLELY_APIKEY --project=my-project --environment=production --output=./public/toggles.json && next build"
  }
}
```

Then use in your app:

```tsx
<TogglelyProvider 
  apiKey="your-api-key"
  project="my-project"
  environment="production"
  baseUrl="https://togglely.io"
  offlineJsonPath="/toggles.json"
>
```

## License

MIT
