# @togglely/sdk

Vanilla JavaScript SDK for Togglely - Works with any framework or vanilla JS.

## Installation

```bash
npm install @togglely/sdk
```

Or via CDN:

```html
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
```

## Usage

### ES Modules

```javascript
import { TogglelyClient } from '@togglely/sdk';

const client = new TogglelyClient({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com'
});

const isEnabled = await client.isEnabled('new-feature', false);
```

### Global Instance (Vanilla JS)

```javascript
import { initTogglely, isEnabled } from '@togglely/sdk';

// Initialize global instance
initTogglely({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-togglely-instance.com'
});

// Use global helpers
const enabled = await isEnabled('new-feature', false);
```

### CDN Usage

```html
<script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
<script>
  const client = new Togglely.TogglelyClient({
    apiKey: 'your-api-key',
    environment: 'production',
    baseUrl: 'https://your-togglely-instance.com'
  });
  
  client.isEnabled('new-feature').then(function(enabled) {
    if (enabled) {
      document.getElementById('new-feature').style.display = 'block';
    }
  });
</script>
```

### DOM Helpers

```javascript
import { togglelyToggle, togglelyInit } from '@togglely/sdk';

// Toggle element visibility based on toggle
togglelyToggle('#new-feature', 'new-feature');

// Initialize multiple elements
togglelyInit({
  'new-feature': ['.new-feature', '.new-banner'],
  'dark-mode': ['body'],
  'premium': { 
    selector: '.premium-content', 
    defaultValue: false,
    invert: false 
  }
});
```

## API

Same as `@togglely/sdk-core`.
