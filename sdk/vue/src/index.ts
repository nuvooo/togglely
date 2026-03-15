/**
 * Togglely Vue SDK
 * 
 * Provides Vue composables for feature toggles
 * 
 * Usage:
 * ```vue
 * <script setup>
 * import { useToggle, useToggles, useTogglelyState } from '@togglely/sdk-vue';
 * 
 * // Boolean toggle
 * const isEnabled = useToggle('new-feature', false);
 * 
 * // String toggle
 * const message = useStringToggle('welcome-message', 'Hello!');
 * 
 * // Number toggle
 * const limit = useNumberToggle('max-items', 10);
 * 
 * // All toggles
 * const allToggles = useToggles();
 * 
 * // State
 * const state = useTogglelyState();
 * </script>
 * 
 * <template>
 *   <div v-if="isEnabled">
 *     New Feature is enabled!
 *   </div>
 *   <div v-else>
 *     Using old feature
 *   </div>
 * </template>
 * ```
 */

import {
  ref,
  readonly,
  inject,
  provide,
  onUnmounted,
  type Ref,
  type DeepReadonly,
  type App
} from 'vue';
import {
  TogglelyClient,
  TogglelyConfig,
  ToggleContext,
  TogglelyState
} from '@togglely/sdk-core';

// ==================== Plugin ====================

const TOGGLELY_CLIENT_KEY = Symbol('togglely-client');

export interface TogglelyPluginOptions extends TogglelyConfig {
  /** Initial toggles for SSR / offline mode */
  initialToggles?: Record<string, any>;
}

/**
 * Vue plugin for Togglely
 * 
 * Usage:
 * ```ts
 * import { createApp } from 'vue';
 * import { createTogglely } from '@togglely/sdk-vue';
 * import App from './App.vue';
 * 
 * const app = createApp(App);
 * 
 * app.use(createTogglely({
 *   apiKey: 'your-api-key',
 *   environment: 'production',
 *   baseUrl: 'https://your-togglely-instance.com'
 * }));
 * 
 * app.mount('#app');
 * ```
 */
export function createTogglely(options: TogglelyPluginOptions) {
  const { initialToggles, ...config } = options;
  
  return {
    install(app: App) {
      // Inject initial toggles for SSR if provided
      if (initialToggles && typeof window !== 'undefined') {
        (window as any).__TOGGLELY_TOGGLES = initialToggles;
      }
      
      const client = new TogglelyClient(config);
      app.provide(TOGGLELY_CLIENT_KEY, client);
      
      // Make client available globally
      app.config.globalProperties.$togglely = client;
    }
  };
}

/**
 * Get the Togglely client from the Vue app
 */
export function useTogglelyClient(): TogglelyClient {
  const client = inject<TogglelyClient>(TOGGLELY_CLIENT_KEY);
  if (!client) {
    throw new Error('useTogglelyClient must be used after installing the Togglely plugin');
  }
  return client;
}

// ==================== Composables ====================

/**
 * Reactive boolean toggle
 */
export function useToggle(key: string, defaultValue: boolean = false): Ref<boolean> {
  const client = useTogglelyClient();
  const value = ref(defaultValue);
  
  // Initial fetch
  client.isEnabled(key, defaultValue).then(result => {
    value.value = result;
  });
  
  // Subscribe to updates
  const unsubscribe = client.on('update', async () => {
    value.value = await client.isEnabled(key, defaultValue);
  });
  
  onUnmounted(() => {
    unsubscribe();
  });
  
  return value;
}

/**
 * Reactive string toggle
 */
export function useStringToggle(key: string, defaultValue: string = ''): Ref<string> {
  const client = useTogglelyClient();
  const value = ref(defaultValue);
  
  client.getString(key, defaultValue).then(result => {
    value.value = result;
  });
  
  const unsubscribe = client.on('update', async () => {
    value.value = await client.getString(key, defaultValue);
  });
  
  onUnmounted(() => {
    unsubscribe();
  });
  
  return value;
}

/**
 * Reactive number toggle
 */
export function useNumberToggle(key: string, defaultValue: number = 0): Ref<number> {
  const client = useTogglelyClient();
  const value = ref(defaultValue);
  
  client.getNumber(key, defaultValue).then(result => {
    value.value = result;
  });
  
  const unsubscribe = client.on('update', async () => {
    value.value = await client.getNumber(key, defaultValue);
  });
  
  onUnmounted(() => {
    unsubscribe();
  });
  
  return value;
}

/**
 * Reactive JSON toggle
 */
export function useJSONToggle<T = any>(key: string, defaultValue: T = {} as T): Ref<T> {
  const client = useTogglelyClient();
  const value = ref<T>(defaultValue);
  
  client.getJSON<T>(key, defaultValue).then(result => {
    value.value = result;
  });
  
  const unsubscribe = client.on('update', async () => {
    value.value = await client.getJSON<T>(key, defaultValue);
  });
  
  onUnmounted(() => {
    unsubscribe();
  });
  
  return value;
}

/**
 * Reactive all toggles
 */
export function useToggles(): DeepReadonly<Ref<Record<string, { value: any; enabled: boolean }>>> {
  const client = useTogglelyClient();
  const toggles = ref<Record<string, { value: any; enabled: boolean }>>({});
  
  toggles.value = client.getAllToggles();
  
  const unsubscribe = client.on('update', () => {
    toggles.value = client.getAllToggles();
  });
  
  onUnmounted(() => {
    unsubscribe();
  });
  
  return readonly(toggles);
}

/**
 * Reactive Togglely state
 */
export function useTogglelyState(): DeepReadonly<Ref<TogglelyState>> {
  const client = useTogglelyClient();
  const state = ref<TogglelyState>(client.getState());
  
  const handlers: Array<() => void> = [];
  
  ['ready', 'update', 'error', 'offline', 'online'].forEach((event) => {
    const unsubscribe = client.on(event as any, (newState) => {
      state.value = newState;
    });
    handlers.push(unsubscribe);
  });
  
  onUnmounted(() => {
    handlers.forEach(unsubscribe => unsubscribe());
  });
  
  return readonly(state);
}

/**
 * Check if toggles are ready
 */
export function useTogglelyReady(): Ref<boolean> {
  const state = useTogglelyState();
  return ref(state.value.isReady);
}

/**
 * Check if in offline mode
 */
export function useTogglelyOffline(): Ref<boolean> {
  const state = useTogglelyState();
  return ref(state.value.isOffline);
}

// ==================== Context Composables ====================

/**
 * Set context for toggle evaluation
 */
export function useTogglelyContext() {
  const client = useTogglelyClient();
  
  return {
    setContext: (context: ToggleContext) => {
      client.setContext(context);
    },
    clearContext: () => {
      client.clearContext();
    },
    getContext: () => client.getContext()
  };
}

// ==================== Directives ====================

/**
 * Vue directive to show/hide elements based on feature toggles
 * 
 * Usage:
 * ```ts
 * import { vFeatureToggle } from '@togglely/sdk-vue';
 * 
 * app.directive('feature-toggle', vFeatureToggle);
 * ```
 * 
 * ```vue
 * <template>
 *   <div v-feature-toggle="'new-feature'">
 *     Only visible when 'new-feature' is enabled
 *   </div>
 *   
 *   <div v-feature-toggle="{ toggle: 'premium', defaultValue: false }">
 *     Premium content
 *   </div>
 * </template>
 * ```
 */
export const vFeatureToggle = {
  mounted(el: HTMLElement, binding: any) {
    const client = (binding.instance?.$togglely as TogglelyClient) || 
                   inject<TogglelyClient>(TOGGLELY_CLIENT_KEY);
    
    if (!client) {
      console.error('[Togglely] Client not found. Make sure to install the Togglely plugin.');
      el.style.display = 'none';
      return;
    }
    
    const config = typeof binding.value === 'string' 
      ? { toggle: binding.value, defaultValue: false }
      : binding.value;
    
    const updateVisibility = async () => {
      const isEnabled = await client.isEnabled(config.toggle, config.defaultValue ?? false);
      el.style.display = isEnabled ? '' : 'none';
    };
    
    updateVisibility();
    
    // Store unsubscribe function on element
    (el as any)._togglelyUnsubscribe = client.on('update', updateVisibility);
  },
  
  updated(el: HTMLElement, binding: any) {
    // Re-evaluate when binding changes
    const client = (binding.instance?.$togglely as TogglelyClient) || 
                   inject<TogglelyClient>(TOGGLELY_CLIENT_KEY);
    
    if (!client) return;
    
    const config = typeof binding.value === 'string' 
      ? { toggle: binding.value, defaultValue: false }
      : binding.value;
    
    client.isEnabled(config.toggle, config.defaultValue ?? false).then(isEnabled => {
      el.style.display = isEnabled ? '' : 'none';
    });
  },
  
  unmounted(el: HTMLElement) {
    // Cleanup subscription
    if ((el as any)._togglelyUnsubscribe) {
      (el as any)._togglelyUnsubscribe();
    }
  }
};

// ==================== Helper Components ====================

/**
 * Component options for FeatureToggle component
 * 
 * Create this component in your project:
 * 
 * ```vue
 * <!-- FeatureToggle.vue -->
 * <script setup>
 * import { useToggle } from '@togglely/sdk-vue';
 * 
 * const props = defineProps({
 *   name: { type: String, required: true },
 *   defaultValue: { type: Boolean, default: false }
 * });
 * 
 * const isEnabled = useToggle(props.name, props.defaultValue);
 * </script>
 * 
 * <template>
 *   <slot v-if="isEnabled" />
 *   <slot v-else name="fallback" />
 * </template>
 * ```
 */

// ==================== Types for global properties ====================

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $togglely: TogglelyClient;
  }
}

// Re-export core
export {
  TogglelyClient,
  TogglelyConfig,
  ToggleContext,
  TogglelyState,
  createOfflineTogglesScript,
  togglesToEnvVars
} from '@togglely/sdk-core';
