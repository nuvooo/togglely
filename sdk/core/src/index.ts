/**
 * Togglely Core SDK - Framework agnostic feature flag management
 * 
 * Features:
 * - Real-time feature flag evaluation
 * - Offline fallback via JSON file, environment variables, or window object
 * - Multi-brand/tenant support
 * - Type-safe flag access
 * - Build-time JSON generation for offline-first deployment
 */

// ==================== Types ====================

export interface TogglelyConfig {
  /** API Key from your Togglely dashboard */
  apiKey: string;
  /** Project key */
  project: string;
  /** Environment key (e.g., 'development', 'production') */
  environment: string;
  /** Base URL of your Togglely instance */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Enable offline fallback (default: true) */
  offlineFallback?: boolean;
  /** Path to offline JSON file for fallback (optional) */
  offlineJsonPath?: string;
  /** Inline offline toggles data (optional) */
  offlineToggles?: Record<string, ToggleValue>;
  /** Prefix for environment variables (default: 'TOGGLELY_') */
  envPrefix?: string;
  /** Auto-fetch toggles on init (default: true) */
  autoFetch?: boolean;
  /** Brand/Tenant key for multi-brand projects (optional) */
  brandKey?: string;
  /** Alias for brandKey - Tenant ID for multi-brand projects (optional) */
  tenantId?: string;
  /** Initial context for targeting (optional) */
  context?: ToggleContext;
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
  flagType?: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';
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

export type TogglelyEventType = 'ready' | 'update' | 'error' | 'offline' | 'online';
export type TogglelyEventHandler = (state: TogglelyState) => void;

// ==================== Togglely Client ====================

export class TogglelyClient {
  private config: TogglelyConfig & { 
    timeout: number; 
    offlineFallback: boolean; 
    envPrefix: string; 
    autoFetch: boolean;
    offlineJsonPath: string | undefined;
  };
  private toggles: Map<string, ToggleValue> = new Map();
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
      timeout: 5000,
      offlineFallback: true,
      envPrefix: 'TOGGLELY_',
      autoFetch: true,
      offlineJsonPath: undefined,
      ...config
    } as TogglelyConfig & { 
      timeout: number; 
      offlineFallback: boolean; 
      envPrefix: string; 
      autoFetch: boolean;
      offlineJsonPath: string | undefined;
    };
    
    // Initialize event handlers
    this.eventHandlers.set('ready', new Set());
    this.eventHandlers.set('update', new Set());
    this.eventHandlers.set('error', new Set());
    this.eventHandlers.set('offline', new Set());
    this.eventHandlers.set('online', new Set());
    
    // Set initial context if provided (including brandKey/tenantId)
    const initialContext: ToggleContext = { ...config.context };
    if (config.brandKey) initialContext.brandKey = config.brandKey;
    if (config.tenantId) initialContext.tenantId = config.tenantId;
    this.context = initialContext;
    
    // Load offline toggles first (if enabled)
    if (this.config.offlineFallback) {
      this.loadOfflineToggles();
    }
    
    // Initial fetch (if enabled)
    if (this.config.autoFetch) {
      this.refresh();
    }
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

  /**
   * Check if a boolean feature flag is enabled
   * @param key - The flag key
   * @param defaultValue - Default value if flag not found
   * @returns Promise<boolean>
   */
  async isEnabled(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.getValue(key);
    
    if (value === null) {
      return defaultValue;
    }
    
    // enabled is the primary on/off switch for a flag.
    // value.value holds the flag's configured value (used for non-boolean use-cases).
    // For boolean flags: 
    // - If NOT enabled (toggle is OFF globally for environment), return false
    // - If ENABLED (toggle is ON), return the boolean value itself (true/false)
    if (typeof value.value === 'boolean') {
      return value.enabled && value.value;
    }

    // Fallback for non-boolean flags or if value is missing
    return value.enabled;
  }

  /**
   * Get a string feature flag value
   * @param key - The flag key
   * @param defaultValue - Default value if flag not found or disabled
   * @returns Promise<string>
   */
  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return String(value.value);
  }

  /**
   * Get a number feature flag value
   * @param key - The flag key
   * @param defaultValue - Default value if flag not found or disabled
   * @returns Promise<number>
   */
  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return Number(value.value);
  }

  /**
   * Get a JSON feature flag value
   * @param key - The flag key
   * @param defaultValue - Default value if flag not found or disabled
   * @returns Promise<T>
   */
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

  /**
   * Get raw toggle value
   * Uses stale-while-revalidate pattern: returns cached value immediately if available,
   * then refreshes from server in background
   * @param key - The flag key
   * @returns Promise<ToggleValue | null>
   */
  async getValue(key: string): Promise<ToggleValue | null> {
    // Check if we have a cached/offline value first (stale-while-revalidate pattern)
    const cachedValue = this.toggles.get(key);
    
    // Fetch from server in background (don't await if we have cached data)
    const fetchFromServer = async (): Promise<ToggleValue | null> => {
      try {
        const data = await this.fetchValueFromServer(key);
        if (data !== null) {
          this.toggles.set(key, data);
        }
        return data;
      } catch {
        // Silently fail - we already returned the cached value or will handle below
        return null;
      }
    };

    // If we have a cached value, return it immediately and update in background
    if (cachedValue !== undefined) {
      // Trigger the fetch in background without awaiting
      fetchFromServer().catch(() => {});
      return cachedValue;
    }

    // No cached value - we need to wait for the server response
    const result = await fetchFromServer();
    if (result !== null) {
      return result;
    }

    // Try offline fallback
    if (this.config.offlineFallback) {
      const offlineValue = this.getOfflineToggle(key);
      if (offlineValue !== null) {
        return offlineValue;
      }
    }
    
    // Return safe default
    return { value: false, enabled: false };
  }

  /**
   * Internal method to fetch a single toggle value from the server
   */
  private async fetchValueFromServer(key: string): Promise<ToggleValue | null> {
    const params = new URLSearchParams();
    // Support both brandKey and tenantId for maximum compatibility
    if (this.context.brandKey) params.set('brandKey', String(this.context.brandKey));
    if (this.context.tenantId) params.set('tenantId', String(this.context.tenantId));
    if (Object.keys(this.context).length > 0) {
      params.set('context', JSON.stringify(this.context));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `${this.config.baseUrl}/sdk/flags/${encodeURIComponent(this.config.project)}/${encodeURIComponent(this.config.environment)}/${encodeURIComponent(key)}${query}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    const response = await this.fetchWithTimeout(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ToggleValue = await response.json();
    
    if (this.state.isOffline) {
      this.state.isOffline = false;
      this.emit('online');
    }
    
    return data;
  }

  /**
   * Get all toggles
   * @returns Record<string, ToggleValue>
   */
  getAllToggles(): Record<string, ToggleValue> {
    const result: Record<string, ToggleValue> = {};
    this.toggles.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // ==================== Offline Fallback ====================

  /**
   * Load offline toggles from multiple sources (in priority order):
   * 1. Inline offlineToggles from config
   * 2. JSON file (if offlineJsonPath is set)
   * 3. window.__TOGGLELY_TOGGLES (browser)
   * 4. Environment variables (Node.js)
   */
  private loadOfflineToggles(): void {
    try {
      // Priority 1: Inline offline toggles from config
      if (this.config.offlineToggles && Object.keys(this.config.offlineToggles).length > 0) {
        for (const [key, value] of Object.entries(this.config.offlineToggles)) {
          this.toggles.set(key, value);
        }
        this.offlineTogglesLoaded = true;
        console.log('[Togglely] Loaded offline toggles from config');
        return;
      }

      // Priority 2: JSON file (browser only - fetch synchronously not possible, will try async)
      if (this.config.offlineJsonPath && typeof window !== 'undefined') {
        this.loadOfflineJsonFile(this.config.offlineJsonPath);
      }

      // Priority 3: Browser environment - check window.__TOGGLELY_TOGGLES
      if (typeof window !== 'undefined' && (window as any).__TOGGLELY_TOGGLES) {
        const offlineToggles = (window as any).__TOGGLELY_TOGGLES;
        for (const [key, value] of Object.entries(offlineToggles)) {
          this.toggles.set(key, this.parseOfflineValue(value));
        }
        this.offlineTogglesLoaded = true;
        console.log('[Togglely] Loaded offline toggles from window.__TOGGLELY_TOGGLES');
        return;
      }

      // Priority 4: Node.js / Bun / Deno environment - check process.env
      if (typeof process !== 'undefined' && process.env) {
        const prefix = this.config.envPrefix;
        for (const [envKey, envValue] of Object.entries(process.env)) {
          if (envKey?.startsWith(prefix) && envValue !== undefined) {
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

  /**
   * Load offline toggles from JSON file (async)
   */
  private async loadOfflineJsonFile(path: string): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        // Browser - fetch the JSON file
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          for (const [key, value] of Object.entries(data)) {
            this.toggles.set(key, this.parseOfflineValue(value));
          }
          this.offlineTogglesLoaded = true;
          console.log('[Togglely] Loaded offline toggles from JSON file:', path);
        }
      } else if (typeof require !== 'undefined') {
        // Node.js - require the JSON file
        const fs = require('fs');
        const pathModule = require('path');
        const fullPath = pathModule.resolve(path);
        
        if (fs.existsSync(fullPath)) {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          for (const [key, value] of Object.entries(data)) {
            this.toggles.set(key, this.parseOfflineValue(value));
          }
          this.offlineTogglesLoaded = true;
          console.log('[Togglely] Loaded offline toggles from JSON file:', fullPath);
        }
      }
    } catch (error) {
      console.warn('[Togglely] Failed to load offline JSON file:', error);
    }
  }

  private getOfflineToggle(key: string): ToggleValue | null {
    if (!this.config.offlineFallback) return null;
    
    const cached = this.toggles.get(key);
    if (cached) {
      if (!this.state.isOffline) {
        this.state.isOffline = true;
        this.emit('offline');
      }
      return cached;
    }
    
    return null;
  }

  private parseOfflineValue(value: any): ToggleValue {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true') return { value: true, enabled: true };
      if (lower === 'false') return { value: false, enabled: true };
      
      if (!isNaN(Number(value))) {
        return { value: Number(value), enabled: true };
      }
      
      try {
        const parsed = JSON.parse(value);
        return { value: parsed, enabled: true };
      } catch {
        return { value, enabled: true };
      }
    }
    
    return { value, enabled: true };
  }

  // ==================== Refresh / Polling ====================

  /**
   * Refresh all toggles from the server
   */
  async refresh(): Promise<void> {
    try {
      const params = new URLSearchParams();
      // Support both brandKey and tenantId for maximum compatibility
      if (this.context.brandKey) params.set('brandKey', String(this.context.brandKey));
      if (this.context.tenantId) params.set('tenantId', String(this.context.tenantId));
      if (Object.keys(this.context).length > 0) {
        params.set('context', JSON.stringify(this.context));
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${encodeURIComponent(this.config.project)}/${encodeURIComponent(this.config.environment)}?${params.toString()}`,
        { headers }
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
      
      if (this.state.isOffline) {
        this.state.isOffline = false;
        this.emit('online');
      }
      
      this.emit('update');
      
    } catch (error) {
      this.state.lastError = error as Error;
      
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
    this.toggles.clear();
    this.eventHandlers.forEach(handlers => handlers.clear());
  }

  // ==================== Private Helpers ====================

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
