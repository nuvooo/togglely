/**
 * Togglely Svelte SDK
 * 
 * Provides Svelte stores for feature toggles
 * 
 * Usage:
 * ```svelte
 * <script>
 *   import { toggle, toggles, togglelyState, setTogglelyContext } from '@togglely/sdk-svelte';
 *   import { TogglelyClient } from '@togglely/sdk-svelte';
 *   
 *   // Initialize client
 *   const client = new TogglelyClient({
 *     apiKey: 'your-api-key',
 *     environment: 'production',
 *     baseUrl: 'https://your-togglely-instance.com'
 *   });
 *   
 *   // Use stores
 *   const isEnabled = toggle('new-feature', false);
 *   const allToggles = toggles();
 *   const state = togglelyState();
 *   
 *   // Set context
 *   setTogglelyContext({ userId: '123' });
 * </script>
 * 
 * {#if $isEnabled}
 *   <NewFeature />
 * {:else}
 *   <OldFeature />
 * {/if}
 * ```
 */

import { writable, readable, derived, type Writable, type Readable } from 'svelte/store';
import {
  TogglelyClient,
  TogglelyConfig,
  ToggleContext,
  TogglelyState
} from '@togglely/sdk-core';

// ==================== Client Instance ====================

let globalClient: TogglelyClient | null = null;

export function initTogglely(config: TogglelyConfig): TogglelyClient {
  if (globalClient) {
    console.warn('[Togglely] Client already initialized, destroying old instance');
    globalClient.destroy();
  }
  
  globalClient = new TogglelyClient(config);
  return globalClient;
}

export function getTogglelyClient(): TogglelyClient {
  if (!globalClient) {
    throw new Error('Togglely not initialized. Call initTogglely first.');
  }
  return globalClient;
}

export function destroyTogglely(): void {
  if (globalClient) {
    globalClient.destroy();
    globalClient = null;
  }
}

// ==================== Stores ====================

/**
 * Store that tracks the Togglely state
 */
export function togglelyState(): Readable<TogglelyState> {
  const client = getTogglelyClient();
  
  return readable<TogglelyState>(client.getState(), (set) => {
    // Update on all events
    const handlers: Array<() => void> = [];
    
    ['ready', 'update', 'error', 'offline', 'online'].forEach((event) => {
      const unsubscribe = client.on(event as any, (state) => {
        set(state);
      });
      handlers.push(unsubscribe);
    });
    
    return () => {
      handlers.forEach(unsubscribe => unsubscribe());
    };
  });
}

/**
 * Store for a boolean toggle
 */
export function toggle(key: string, defaultValue: boolean = false): Readable<boolean> {
  const client = getTogglelyClient();
  
  return readable<boolean>(defaultValue, (set) => {
    // Initial check
    client.isEnabled(key, defaultValue).then(set);
    
    // Update on toggle updates
    const unsubscribe = client.on('update', async () => {
      const value = await client.isEnabled(key, defaultValue);
      set(value);
    });
    
    return unsubscribe;
  });
}

/**
 * Store for a string toggle
 */
export function stringToggle(key: string, defaultValue: string = ''): Readable<string> {
  const client = getTogglelyClient();
  
  return readable<string>(defaultValue, (set) => {
    client.getString(key, defaultValue).then(set);
    
    const unsubscribe = client.on('update', async () => {
      const value = await client.getString(key, defaultValue);
      set(value);
    });
    
    return unsubscribe;
  });
}

/**
 * Store for a number toggle
 */
export function numberToggle(key: string, defaultValue: number = 0): Readable<number> {
  const client = getTogglelyClient();
  
  return readable<number>(defaultValue, (set) => {
    client.getNumber(key, defaultValue).then(set);
    
    const unsubscribe = client.on('update', async () => {
      const value = await client.getNumber(key, defaultValue);
      set(value);
    });
    
    return unsubscribe;
  });
}

/**
 * Store for a JSON toggle
 */
export function jsonToggle<T = any>(key: string, defaultValue: T = {} as T): Readable<T> {
  const client = getTogglelyClient();
  
  return readable<T>(defaultValue, (set) => {
    client.getJSON<T>(key, defaultValue).then(set);
    
    const unsubscribe = client.on('update', async () => {
      const value = await client.getJSON<T>(key, defaultValue);
      set(value);
    });
    
    return unsubscribe;
  });
}

/**
 * Store for all toggles
 */
export function toggles(): Readable<Record<string, { value: any; enabled: boolean }>> {
  const client = getTogglelyClient();
  
  return readable<Record<string, { value: any; enabled: boolean }>>({}, (set) => {
    set(client.getAllToggles());
    
    const unsubscribe = client.on('update', () => {
      set(client.getAllToggles());
    });
    
    return unsubscribe;
  });
}

/**
 * Derived store that returns true when toggles are ready
 */
export function togglelyReady(): Readable<boolean> {
  return derived(togglelyState(), $state => $state.isReady);
}

/**
 * Derived store that returns true when in offline mode
 */
export function togglelyOffline(): Readable<boolean> {
  return derived(togglelyState(), $state => $state.isOffline);
}

// ==================== Context ====================

/**
 * Set context for toggle evaluation
 */
export function setTogglelyContext(context: ToggleContext): void {
  const client = getTogglelyClient();
  client.setContext(context);
}

/**
 * Get current context
 */
export function getTogglelyContext(): ToggleContext {
  const client = getTogglelyClient();
  return client.getContext();
}

/**
 * Clear context
 */
export function clearTogglelyContext(): void {
  const client = getTogglelyClient();
  client.clearContext();
}

// ==================== Components (Svelte 5 Runes Support) ====================

/**
 * Creates a reactive toggle value using Svelte 5 runes
 * For Svelte 5+ users
 */
export function createToggle(key: string, defaultValue: boolean = false): { value: boolean } {
  const client = getTogglelyClient();
  
  // This is a placeholder for Svelte 5 runes syntax
  // Users would use: let enabled = $state(createToggle('feature'))
  let value = defaultValue;
  
  client.isEnabled(key, defaultValue).then(v => { value = v; });
  
  const unsubscribe = client.on('update', async () => {
    value = await client.isEnabled(key, defaultValue);
  });
  
  // Cleanup would need to be handled by the component
  return {
    get value() { return value; }
  };
}

// ==================== Action ====================

/**
 * Svelte action to show/hide elements based on a feature toggle
 * 
 * Usage:
 * ```svelte
 * <div use:featureToggle={'new-feature'}>
 *   This is only visible when 'new-feature' is enabled
 * </div>
 * ```
 */
export function featureToggle(node: HTMLElement, key: string): { destroy(): void } {
  const client = getTogglelyClient();
  
  let currentKey = key;
  
  async function updateVisibility() {
    const isEnabled = await client.isEnabled(currentKey, false);
    node.style.display = isEnabled ? '' : 'none';
  }
  
  updateVisibility();
  
  const unsubscribe = client.on('update', updateVisibility);
  
  return {
    destroy() {
      unsubscribe();
    },
    update(newKey: string) {
      currentKey = newKey;
      updateVisibility();
    }
  };
}

// ==================== Helper Components ====================

// These are pseudo-components since we can't export .svelte files from TypeScript
// Users should create these components in their own projects

/**
 * Example FeatureToggle component for Svelte:
 * 
 * ```svelte
 * <!-- FeatureToggle.svelte -->
 * <script>
 *   import { toggle } from '@togglely/sdk-svelte';
 *   
 *   export let name: string;
 *   export let defaultValue: boolean = false;
 *   
 *   const isEnabled = toggle(name, defaultValue);
 * </script>
 * 
 * {#if $isEnabled}
 *   <slot />
 * {:else}
 *   <slot name="fallback" />
 * {/if}
 * ```
 */

// Re-export core
export {
  TogglelyClient,
  TogglelyConfig,
  ToggleContext,
  TogglelyState,
  createOfflineTogglesScript,
  togglesToEnvVars
} from '@togglely/sdk-core';
