/**
 * Togglely Core SDK - Framework agnostic
 * 
 * Supports offline fallback via environment variables
 */

// Types
export interface TogglelyConfig {
  /** API Key from your Togglely dashboard */
  apiKey: string;
  /** Project key */
  project: string;
  /** Environment key (e.g., 'development', 'production') */
  environment: string;
  /** Base URL of your Togglely instance */
  baseUrl: string;
  /** Refresh interval in milliseconds (default: 60000) */
  refreshInterval?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Enable offline mode fallback via environment variables (default: true) */
  offlineFallback?: boolean;
  /** Prefix for environment variables (default: 'TOGGLELY_') */
  envPrefix?: string;
}

export interface ToggleContext {
  userId?: string;
  email?: string;
  country?: string;
  region?: string;
  [key: string]: any;
}

export interface ToggleValue {
  value: any;
  enabled: boolean;
}

export interface AllTogglesResponse {
  [key: string]: ToggleValue;
}

export interface TogglelyState {
  isReady: boolean;
  isOffline: boolean;
  lastError: Error | null;
  lastFetch: Date | null;
}

// Event types
export type TogglelyEventType = 'ready' | 'update' | 'error' | 'offline' | 'online';
export type TogglelyEventHandler = (state: TogglelyState) => void;

/**
 * Core Togglely Client
 */
export class TogglelyClient {
  private config: Required<TogglelyConfig>;
  private toggles: Map<string, ToggleValue> = new Map();
  private refreshTimer?: ReturnType<typeof setInterval>;
  private context: ToggleContext = {};
  private state: TogglelyState = {
    isReady: false,
    isOffline: false,
    lastError: null,
    lastFetch: null
  };
  private eventHandlers: Map<TogglelyEventType, Set<TogglelyEventHandler>> = new Map();
  private offlineTogglesLoaded: boolean = false;

  constructor(config: TogglelyConfig) {
    this.config = {
      refreshInterval: 60000,
      timeout: 5000,
      offlineFallback: true,
      envPrefix: 'TOGGLELY_',
      ...config
    };
    
    // Initialize event handlers
    this.eventHandlers.set('ready', new Set());
    this.eventHandlers.set('update', new Set());
    this.eventHandlers.set('error', new Set());
    this.eventHandlers.set('offline', new Set());
    this.eventHandlers.set('online', new Set());
    
    // Load offline toggles first (if enabled)
    if (this.config.offlineFallback) {
      this.loadOfflineToggles();
    }
    
    // Start polling
    this.startPolling();
  }

  // ==================== Event Handling ====================
  
  on(event: TogglelyEventType, handler: TogglelyEventHandler): () => void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
    return () => this.off(event, handler);
  }

  off(event: TogglelyEventType, handler: TogglelyEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: TogglelyEventType): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler({ ...this.state }));
    }
  }

  // ==================== Context ====================

  setContext(context: ToggleContext): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): ToggleContext {
    return { ...this.context };
  }

  clearContext(): void {
    this.context = {};
  }

  // ==================== State ====================

  getState(): TogglelyState {
    return { ...this.state };
  }

  isReady(): boolean {
    return this.state.isReady;
  }

  isOffline(): boolean {
    return this.state.isOffline;
  }

  // ==================== Toggle Accessors ====================

  async isEnabled(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.getValue(key);
    if (value === null) return defaultValue;
    return value.enabled && value.value === true;
  }

  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return String(value.value);
  }

  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return Number(value.value);
  }

  async getJSON<T = any>(key: string, defaultValue: T = {} as T): Promise<T> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    
    if (typeof value.value === 'string') {
      try {
        return JSON.parse(value.value) as T;
      } catch {
        return defaultValue;
      }
    }
    
    return value.value as T;
  }

  async getValue(key: string): Promise<ToggleValue | null> {
    // Try cache first - but only if no context is set
    if (Object.keys(this.context).length === 0) {
      const cached = this.toggles.get(key);
      if (cached) {
        return cached;
      }
    }

    // Fetch from server
    try {
      const params = new URLSearchParams();
      const brandKey = this.context.tenantId || this.context.brandKey;
      if (brandKey) params.set('brandKey', String(brandKey));
      else if (Object.keys(this.context).length > 0) {
        params.set('context', JSON.stringify(this.context));
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${this.config.project}/${this.config.environment}/${key}${query}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: ToggleValue = await response.json();
      this.toggles.set(key, data);
      
      // Update state if we were offline
      if (this.state.isOffline) {
        this.state.isOffline = false;
        this.emit('online');
      }
      
      return data;
    } catch (error) {
      // Try offline fallback
      const offlineValue = this.getOfflineToggle(key);
      if (offlineValue !== null) {
        return offlineValue;
      }
      
      console.error(`[Togglely] Failed to fetch toggle "${key}":`, error);
      return null;
    }
  }

  getAllToggles(): Record<string, ToggleValue> {
    const result: Record<string, ToggleValue> = {};
    this.toggles.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // ==================== Offline Fallback ====================

  /**
   * Load toggles from environment variables
   * Format: TOGGLELY_<TOGGLE_KEY>=<value> or TOGGLELY_<TOGGLE_KEY>_ENABLED=true
   */
  private loadOfflineToggles(): void {
    try {
      // Browser environment - check window.__TOGGLELY_TOGGLES
      if (typeof window !== 'undefined' && (window as any).__TOGGLELY_TOGGLES) {
        const offlineToggles = (window as any).__TOGGLELY_TOGGLES;
        for (const [key, value] of Object.entries(offlineToggles)) {
          this.toggles.set(key, this.parseOfflineValue(value));
        }
        this.offlineTogglesLoaded = true;
        console.log('[Togglely] Loaded offline toggles from window.__TOGGLELY_TOGGLES');
        return;
      }

      // Node.js / Bun / Deno environment - check process.env
      if (typeof process !== 'undefined' && process.env) {
        const prefix = this.config.envPrefix;
        for (const [envKey, envValue] of Object.entries(process.env)) {
          if (envKey?.startsWith(prefix) && envValue !== undefined) {
            // Parse toggle key: TOGGLELY_MY_FEATURE -> my-feature
            const toggleKey = envKey
              .slice(prefix.length)
              .toLowerCase()
              .replace(/_/g, '-');
            
            this.toggles.set(toggleKey, this.parseOfflineValue(envValue));
          }
        }
        this.offlineTogglesLoaded = true;
        console.log('[Togglely] Loaded offline toggles from environment variables');
      }
    } catch (error) {
      console.warn('[Togglely] Failed to load offline toggles:', error);
    }
  }

  private getOfflineToggle(key: string): ToggleValue | null {
    if (!this.config.offlineFallback) return null;
    
    // Try to get from already loaded offline toggles
    const cached = this.toggles.get(key);
    if (cached) {
      // If we haven't emitted offline event yet, do it now
      if (!this.state.isOffline) {
        this.state.isOffline = true;
        this.emit('offline');
      }
      return cached;
    }
    
    return null;
  }

  private parseOfflineValue(value: any): ToggleValue {
    // Handle boolean strings
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true') return { value: true, enabled: true };
      if (lower === 'false') return { value: false, enabled: true };
      
      // Try to parse as number
      if (!isNaN(Number(value))) {
        return { value: Number(value), enabled: true };
      }
      
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(value);
        return { value: parsed, enabled: true };
      } catch {
        // Return as string
        return { value, enabled: true };
      }
    }
    
    return { value, enabled: true };
  }

  // ==================== Refresh / Polling ====================

  async refresh(): Promise<void> {
    try {
      const params = new URLSearchParams();
      if (this.config.apiKey) params.set('apiKey', this.config.apiKey);
      const brandKey = this.context.tenantId || this.context.brandKey;
      if (brandKey) params.set('brandKey', String(brandKey));
      else if (Object.keys(this.context).length > 0) {
        params.set('context', JSON.stringify(this.context));
      }
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${this.config.project}/${this.config.environment}?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AllTogglesResponse = await response.json();
      
      this.toggles.clear();
      for (const [key, value] of Object.entries(data)) {
        this.toggles.set(key, value);
      }
      
      this.state.lastFetch = new Date();
      this.state.lastError = null;
      
      if (!this.state.isReady) {
        this.state.isReady = true;
        this.emit('ready');
      }
      
      // If we were offline, go online
      if (this.state.isOffline) {
        this.state.isOffline = false;
        this.emit('online');
      }
      
      this.emit('update');
      
    } catch (error) {
      this.state.lastError = error as Error;
      
      // If we have offline toggles, switch to offline mode
      if (this.config.offlineFallback && this.offlineTogglesLoaded) {
        if (!this.state.isOffline) {
          this.state.isOffline = true;
          this.emit('offline');
        }
      }
      
      this.emit('error');
      console.error('[Togglely] Failed to refresh toggles:', error);
    }
  }

  forceOfflineMode(): void {
    this.state.isOffline = true;
    this.emit('offline');
  }

  forceOnlineMode(): void {
    this.state.isOffline = false;
    this.refresh();
    this.emit('online');
  }

  // ==================== Cleanup ====================

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.toggles.clear();
    this.eventHandlers.forEach(handlers => handlers.clear());
  }

  // ==================== Private Helpers ====================

  private startPolling(): void {
    // Initial fetch
    this.refresh();
    
    // Set up polling
    this.refreshTimer = setInterval(() => {
      if (!this.state.isOffline) {
        this.refresh();
      }
    }, this.config.refreshInterval);
  }

  private fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.config.timeout);

      fetch(url, options)
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

// ==================== Utility Functions ====================

/**
 * Create a client-side toggle loader script
 * Use this to inject offline toggles into your HTML
 */
export function createOfflineTogglesScript(toggles: Record<string, any>): string {
  return `<script>window.__TOGGLELY_TOGGLES = ${JSON.stringify(toggles)};</script>`;
}

/**
 * Helper to convert toggles to environment variables
 */
export function togglesToEnvVars(
  toggles: Record<string, any>, 
  prefix: string = 'TOGGLELY_'
): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(toggles)) {
    const envKey = prefix + key.toUpperCase().replace(/-/g, '_');
    envVars[envKey] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  
  return envVars;
}

// Default export
export default TogglelyClient;
