/**
 * Togglely Vanilla JavaScript SDK
 * 
 * Simple wrapper around @togglely/sdk-core for vanilla JS projects
 * Can be used directly in browser or Node.js
 * 
 * CDN Usage:
 * ```html
 * <script src="https://unpkg.com/@togglely/sdk/dist/index.umd.min.js"></script>
 * <script>
 *   const client = new Togglely.TogglelyClient({
 *     apiKey: 'your-api-key',
 *     environment: 'production',
 *     baseUrl: 'https://your-togglely-instance.com'
 *   });
 *   
 *   client.isEnabled('new-feature').then(enabled => {
 *     if (enabled) {
 *       document.getElementById('new-feature').style.display = 'block';
 *     }
 *   });
 * </script>
 * ```
 * 
 * Module Usage:
 * ```javascript
 * import { TogglelyClient } from '@togglely/sdk';
 * 
 * const client = new TogglelyClient({
 *   apiKey: 'your-api-key',
 *   environment: 'production',
 *   baseUrl: 'https://your-togglely-instance.com'
 * });
 * 
 * // Check toggle
 * const isEnabled = await client.isEnabled('new-feature', false);
 * 
 * // Listen to events
 * client.on('ready', () => console.log('Toggles loaded!'));
 * client.on('offline', () => console.log('Using offline toggles'));
 * ```
 * 
 * Offline Mode with Environment Variables:
 * 
 * Node.js:
 * ```bash
 * TOGGLELY_NEW_FEATURE=true
 * TOGGLELY_MAX_ITEMS=100
 * TOGGLELY_WELCOME_MESSAGE="Hello World"
 * ```
 * 
 * Browser (inject before SDK loads):
 * ```html
 * <script>
 *   window.__TOGGLELY_TOGGLES = {
 *     'new-feature': true,
 *     'max-items': 100,
 *     'welcome-message': 'Hello World'
 *   };
 * </script>
 * ```
 */

// Re-export everything from core
export {
  TogglelyClient,
  TogglelyConfig,
  ToggleContext,
  TogglelyState,
  TogglelyEventType,
  TogglelyEventHandler,
  ToggleValue,
  AllTogglesResponse,
  createOfflineTogglesScript,
  togglesToEnvVars
} from '@togglely/sdk-core';

import { TogglelyClient, TogglelyConfig } from '@togglely/sdk-core';

// ==================== Helper Functions for Vanilla JS ====================

/**
 * Initialize Togglely with global instance
 * Creates a global `window.togglely` instance for easy access
 */
export function initTogglely(config: TogglelyConfig): TogglelyClient {
  const client = new TogglelyClient(config);
  
  // Make available globally in browser
  if (typeof window !== 'undefined') {
    (window as any).togglely = client;
  }
  
  return client;
}

/**
 * Get the global Togglely instance
 */
export function getGlobalTogglely(): TogglelyClient | null {
  if (typeof window !== 'undefined') {
    return (window as any).togglely || null;
  }
  return null;
}

/**
 * Check if a feature is enabled using the global instance
 */
export async function isEnabled(key: string, defaultValue: boolean = false): Promise<boolean> {
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return defaultValue;
  }
  return client.isEnabled(key, defaultValue);
}

/**
 * Get a string toggle value using the global instance
 */
export async function getString(key: string, defaultValue: string = ''): Promise<string> {
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return defaultValue;
  }
  return client.getString(key, defaultValue);
}

/**
 * Get a number toggle value using the global instance
 */
export async function getNumber(key: string, defaultValue: number = 0): Promise<number> {
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return defaultValue;
  }
  return client.getNumber(key, defaultValue);
}

/**
 * Get a JSON toggle value using the global instance
 */
export async function getJSON<T = any>(key: string, defaultValue: T = {} as T): Promise<T> {
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return defaultValue;
  }
  return client.getJSON<T>(key, defaultValue);
}

// ==================== DOM Helpers ====================

/**
 * Show/hide DOM elements based on feature toggles
 * 
 * Usage:
 * ```javascript
 * // Show element when toggle is enabled
 * togglelyToggle('#new-feature', 'new-feature');
 * 
 * // Hide element when toggle is disabled
 * togglelyToggle('#old-feature', 'new-feature', { invert: true });
 * ```
 */
export async function togglelyToggle(
  selector: string,
  toggleKey: string,
  options: { 
    defaultValue?: boolean;
    invert?: boolean;
    hideClass?: string;
    showClass?: string;
  } = {}
): Promise<void> {
  const {
    defaultValue = false,
    invert = false,
    hideClass = 'togglely-hidden',
    showClass = 'togglely-visible'
  } = options;
  
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return;
  }
  
  const isToggleEnabled = await client.isEnabled(toggleKey, defaultValue);
  const shouldShow = invert ? !isToggleEnabled : isToggleEnabled;
  
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    if (shouldShow) {
      el.classList.remove(hideClass);
      el.classList.add(showClass);
      (el as HTMLElement).style.display = '';
    } else {
      el.classList.remove(showClass);
      el.classList.add(hideClass);
      (el as HTMLElement).style.display = 'none';
    }
  });
}

/**
 * Initialize togglely toggle for multiple elements
 * Automatically updates when toggles change
 * 
 * Usage:
 * ```javascript
 * togglelyInit({
 *   'new-feature': ['.new-feature', '.new-banner'],
 *   'dark-mode': ['body'],
 *   'premium': { selector: '.premium-content', defaultValue: false }
 * });
 * ```
 */
export function togglelyInit(
  config: Record<string, string | string[] | { selector: string; defaultValue?: boolean; invert?: boolean }>
): () => void {
  const client = getGlobalTogglely();
  if (!client) {
    console.error('[Togglely] No global instance found. Call initTogglely() first.');
    return () => {};
  }
  
  const updateAll = async () => {
    for (const [toggleKey, value] of Object.entries(config)) {
      let selectors: string[];
      let defaultValue = false;
      let invert = false;
      
      if (typeof value === 'string') {
        selectors = [value];
      } else if (Array.isArray(value)) {
        selectors = value;
      } else {
        selectors = [value.selector];
        defaultValue = value.defaultValue ?? false;
        invert = value.invert ?? false;
      }
      
      const isToggleEnabled = await client.isEnabled(toggleKey, defaultValue);
      const shouldShow = invert ? !isToggleEnabled : isToggleEnabled;
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          (el as HTMLElement).style.display = shouldShow ? '' : 'none';
        });
      });
    }
  };
  
  // Initial update
  updateAll();
  
  // Subscribe to updates
  const unsubscribe = client.on('update', updateAll);
  
  return unsubscribe;
}

// ==================== Default Export ====================

export default TogglelyClient;
