/**
 * Flagify SDK for JavaScript/TypeScript
 * 
 * Usage:
 * ```typescript
 * import { FlagifyClient } from '@flagify/sdk';
 * 
 * const client = new FlagifyClient({
 *   apiKey: 'your-api-key',
 *   environment: 'production',
 *   baseUrl: 'https://your-flagify-instance.com'
 * });
 * 
 * // Check if feature is enabled
 * const isEnabled = await client.isEnabled('new-feature');
 * 
 * // Get string value
 * const message = await client.getString('welcome-message', 'default');
 * 
 * // Get number value
 * const limit = await client.getNumber('max-items', 10);
 * 
 * // Get JSON value
 * const config = await client.getJSON('app-config', {});
 * ```
 */

export interface FlagifyConfig {
  /** API Key from your Flagify dashboard */
  apiKey: string;
  /** Environment key (e.g., 'development', 'production') */
  environment: string;
  /** Base URL of your Flagify instance */
  baseUrl: string;
  /** Refresh interval in milliseconds (default: 60000) */
  refreshInterval?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}

export interface FlagContext {
  userId?: string;
  email?: string;
  country?: string;
  region?: string;
  [key: string]: any;
}

interface FlagValue {
  value: any;
  enabled: boolean;
}

interface AllFlagsResponse {
  [key: string]: FlagValue;
}

export class FlagifyClient {
  private config: Required<FlagifyConfig>;
  private flags: Map<string, FlagValue> = new Map();
  private refreshTimer?: NodeJS.Timeout;
  private context: FlagContext = {};

  constructor(config: FlagifyConfig) {
    this.config = {
      refreshInterval: 60000,
      timeout: 5000,
      ...config
    };
    
    // Start polling
    this.startPolling();
  }

  /**
   * Set context for flag evaluation
   */
  setContext(context: FlagContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Check if a boolean feature flag is enabled
   */
  async isEnabled(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.getValue(key);
    if (value === null) return defaultValue;
    return value.enabled && value.value === true;
  }

  /**
   * Get string flag value
   */
  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return String(value.value);
  }

  /**
   * Get number flag value
   */
  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getValue(key);
    if (value === null || !value.enabled) return defaultValue;
    return Number(value.value);
  }

  /**
   * Get JSON flag value
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
   * Get raw flag value
   */
  async getValue(key: string): Promise<FlagValue | null> {
    // Try cache first
    const cached = this.flags.get(key);
    if (cached) {
      return cached;
    }

    // Fetch from server
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${this.config.environment}/${key}`,
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

      const data: FlagValue = await response.json();
      this.flags.set(key, data);
      return data;
    } catch (error) {
      console.error(`[Flagify] Failed to fetch flag "${key}":`, error);
      return null;
    }
  }

  /**
   * Refresh all flags from server
   */
  async refresh(): Promise<void> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${this.config.environment}`,
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

      const data: AllFlagsResponse = await response.json();
      
      this.flags.clear();
      for (const [key, value] of Object.entries(data)) {
        this.flags.set(key, value);
      }
    } catch (error) {
      console.error('[Flagify] Failed to refresh flags:', error);
    }
  }

  /**
   * Stop polling and cleanup
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.flags.clear();
  }

  private startPolling(): void {
    // Initial fetch
    this.refresh();
    
    // Set up polling
    this.refreshTimer = setInterval(() => {
      this.refresh();
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

// Default export
export default FlagifyClient;
