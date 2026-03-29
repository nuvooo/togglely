/**
 * Togglely Core SDK - Framework agnostic feature flag management
 *
 * Professionalized refresh model:
 * - Cached reads are side-effect free by default
 * - Network refresh is explicit and configurable
 * - Optional interval refresh strategy
 * - Optional stale-while-revalidate with cooldown
 * - update events only emit on actual toggle changes
 */

// --- Typed Error Classes ---

export class TogglelyError extends Error {
  public readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'TogglelyError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class TogglelyNetworkError extends TogglelyError {
  public readonly statusCode: number | undefined
  public readonly response: Response | undefined

  constructor(
    message: string,
    statusCode?: number,
    response?: Response
  ) {
    super(message, 'NETWORK_ERROR')
    this.name = 'TogglelyNetworkError'
    this.statusCode = statusCode
    this.response = response
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class TogglelyConfigError extends TogglelyError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR')
    this.name = 'TogglelyConfigError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class TogglelyTimeoutError extends TogglelyError {
  constructor(message: string = 'Request timeout') {
    super(message, 'TIMEOUT_ERROR')
    this.name = 'TogglelyTimeoutError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// --- Interfaces ---

export interface TogglelyConfig {
  apiKey: string
  project: string
  environment: string
  baseUrl: string
  timeout?: number
  offlineFallback?: boolean
  offlineJsonPath?: string
  offlineToggles?: Record<string, ToggleValue>
  envPrefix?: string
  autoFetch?: boolean
  brandKey?: string
  tenantId?: string
  context?: ToggleContext
  refreshStrategy?: 'manual' | 'interval' | 'stale-while-revalidate'
  refreshIntervalMs?: number
  minRefreshIntervalMs?: number
  trackingCallback?: (event: ExperimentTrackingEvent) => void
  enableExposureTracking?: boolean
}

export interface ToggleContext {
  userId?: string
  email?: string
  country?: string
  region?: string
  [key: string]: any
}

export interface ToggleValue {
  value: any
  enabled: boolean
  flagType?: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
  experiment?: {
    key: string
    variantKey: string
  }
}

export interface ExperimentTrackingEvent {
  experimentKey: string
  variantKey: string
  userId: string
  type: 'exposure' | 'conversion'
  timestamp: number
  flagKey?: string
}

export interface AllTogglesResponse {
  [key: string]: ToggleValue
}

export interface TogglelyState {
  isReady: boolean
  isOffline: boolean
  lastError: Error | null
  lastFetch: Date | null
}

export type TogglelyEventType =
  | 'ready'
  | 'update'
  | 'error'
  | 'offline'
  | 'online'
export type TogglelyEventHandler = (state: TogglelyState) => void

export class TogglelyClient {
  private config: TogglelyConfig & {
    timeout: number
    offlineFallback: boolean
    envPrefix: string
    autoFetch: boolean
    offlineJsonPath: string | undefined
    refreshStrategy: 'manual' | 'interval' | 'stale-while-revalidate'
    refreshIntervalMs: number
    minRefreshIntervalMs: number
  }

  private toggles: Map<string, ToggleValue> = new Map()
  private context: ToggleContext = {}
  private state: TogglelyState = {
    isReady: false,
    isOffline: false,
    lastError: null,
    lastFetch: null,
  }
  private eventHandlers: Map<TogglelyEventType, Set<TogglelyEventHandler>> =
    new Map()
  private offlineTogglesLoaded = false

  private trackedExposures: Set<string> = new Set()
  private pendingEvents: ExperimentTrackingEvent[] = []
  private eventFlushTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly EVENT_BATCH_SIZE = 50
  private readonly EVENT_FLUSH_INTERVAL = 10000

  private pendingKeys: Set<string> = new Set()
  private pendingPromises: Map<
    string,
    Array<{
      resolve: (value: ToggleValue | null) => void
      reject: (error: any) => void
    }>
  > = new Map()
  private batchTimeout: ReturnType<typeof setTimeout> | null = null
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private inFlightRefresh: Promise<void> | null = null
  private lastRefreshTime = 0
  private readonly BATCH_DELAY = 10

  constructor(config: TogglelyConfig) {
    if (!config.apiKey) {
      throw new TogglelyConfigError('apiKey is required')
    }
    if (!config.project) {
      throw new TogglelyConfigError('project is required')
    }
    if (!config.environment) {
      throw new TogglelyConfigError('environment is required')
    }
    if (!config.baseUrl) {
      throw new TogglelyConfigError('baseUrl is required')
    }

    this.config = {
      timeout: 5000,
      offlineFallback: true,
      envPrefix: 'TOGGLELY_',
      autoFetch: true,
      offlineJsonPath: undefined,
      refreshStrategy: 'manual',
      refreshIntervalMs: 30000,
      minRefreshIntervalMs: 5000,
      ...config,
    }

    this.eventHandlers.set('ready', new Set())
    this.eventHandlers.set('update', new Set())
    this.eventHandlers.set('error', new Set())
    this.eventHandlers.set('offline', new Set())
    this.eventHandlers.set('online', new Set())

    const initialContext: ToggleContext = { ...config.context }
    if (config.brandKey) initialContext.brandKey = config.brandKey
    if (config.tenantId) initialContext.tenantId = config.tenantId
    this.context = initialContext

    if (this.config.offlineFallback) {
      this.loadOfflineToggles()
    }

    if (this.config.autoFetch) {
      this.refresh().catch(() => {})
    }

    this.setupRefreshStrategy()
  }

  on(event: TogglelyEventType, handler: TogglelyEventHandler): () => void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.add(handler)
    }
    return () => this.off(event, handler)
  }

  off(event: TogglelyEventType, handler: TogglelyEventHandler): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  private emit(event: TogglelyEventType): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler({ ...this.state }))
    }
  }

  setContext(context: ToggleContext): void {
    this.context = { ...this.context, ...context }
  }

  getContext(): ToggleContext {
    return { ...this.context }
  }

  clearContext(): void {
    this.context = {}
  }

  getState(): TogglelyState {
    return { ...this.state }
  }

  isReady(): boolean {
    return this.state.isReady
  }

  isOffline(): boolean {
    return this.state.isOffline
  }

  async isEnabled(
    key: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    const value = await this.getValue(key)
    if (value === null) return defaultValue
    if (typeof value.value === 'boolean') {
      return value.enabled && value.value
    }
    return value.enabled
  }

  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const value = await this.getValue(key)
    if (value === null || !value.enabled) return defaultValue
    return String(value.value)
  }

  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.getValue(key)
    if (value === null || !value.enabled) return defaultValue
    return Number(value.value)
  }

  async getJSON<T = any>(key: string, defaultValue: T = {} as T): Promise<T> {
    const value = await this.getValue(key)
    if (value === null || !value.enabled) return defaultValue
    if (typeof value.value === 'string') {
      try {
        return JSON.parse(value.value) as T
      } catch {
        return defaultValue
      }
    }
    return value.value as T
  }

  async getValue(key: string): Promise<ToggleValue | null> {
    const cachedValue = this.toggles.get(key)
    if (cachedValue !== undefined) {
      this.trackExposureIfNeeded(cachedValue, key)
      if (this.config.refreshStrategy === 'stale-while-revalidate') {
        this.scheduleBackgroundRefresh()
      }
      return cachedValue
    }

    const existingPromise = this.pendingPromises.get(key)
    if (existingPromise) {
      return new Promise((resolve, reject) => {
        existingPromise.push({ resolve, reject })
      })
    }

    this.pendingKeys.add(key)

    return new Promise((resolve, reject) => {
      const promises = this.pendingPromises.get(key) || []
      promises.push({ resolve, reject })
      this.pendingPromises.set(key, promises)
      this.scheduleBatchExecution()
    })
  }

  private setupRefreshStrategy(): void {
    if (this.config.refreshStrategy !== 'interval') {
      return
    }

    this.intervalHandle = setInterval(() => {
      this.refresh().catch(() => {})
    }, this.config.refreshIntervalMs)
  }

  private shouldRefreshNow(): boolean {
    return Date.now() - this.lastRefreshTime >= this.config.minRefreshIntervalMs
  }

  private scheduleBackgroundRefresh(): void {
    if (this.refreshTimeout || !this.shouldRefreshNow()) {
      return
    }

    this.refreshTimeout = setTimeout(() => {
      this.refreshTimeout = null
      this.refresh().catch(() => {})
    }, this.BATCH_DELAY)
  }

  private scheduleBatchExecution(): void {
    if (this.batchTimeout) {
      return
    }

    this.batchTimeout = setTimeout(() => {
      this.executeBatch()
    }, this.BATCH_DELAY)
  }

  private async executeBatch(): Promise<void> {
    this.batchTimeout = null

    const keys = Array.from(this.pendingKeys)
    const promises = new Map(this.pendingPromises)

    this.pendingKeys.clear()
    this.pendingPromises.clear()

    if (keys.length === 0) {
      return
    }

    try {
      await this.refresh()

      for (const key of keys) {
        const keyPromises = promises.get(key) || []
        const value = this.toggles.get(key) || null
        if (value) {
          this.trackExposureIfNeeded(value, key)
        }
        for (const { resolve } of keyPromises) {
          resolve(value)
        }
      }
    } catch (error) {
      for (const key of keys) {
        const keyPromises = promises.get(key) || []
        for (const { reject } of keyPromises) {
          reject(error)
        }
      }
    }
  }

  getAllToggles(): Record<string, ToggleValue> {
    const result: Record<string, ToggleValue> = {}
    this.toggles.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  private loadOfflineToggles(): void {
    try {
      if (
        this.config.offlineToggles &&
        Object.keys(this.config.offlineToggles).length > 0
      ) {
        for (const [key, value] of Object.entries(this.config.offlineToggles)) {
          this.toggles.set(key, value)
        }
        this.offlineTogglesLoaded = true
        console.log('[Togglely] Loaded offline toggles from config')
        return
      }

      if (this.config.offlineJsonPath && typeof window !== 'undefined') {
        this.loadOfflineJsonFile(this.config.offlineJsonPath)
      }

      if (typeof window !== 'undefined' && (window as any).__TOGGLELY_TOGGLES) {
        const offlineToggles = (window as any).__TOGGLELY_TOGGLES
        for (const [key, value] of Object.entries(offlineToggles)) {
          this.toggles.set(key, this.parseOfflineValue(value))
        }
        this.offlineTogglesLoaded = true
        console.log(
          '[Togglely] Loaded offline toggles from window.__TOGGLELY_TOGGLES'
        )
        return
      }

      if (typeof process !== 'undefined' && process.env) {
        const prefix = this.config.envPrefix
        for (const [envKey, envValue] of Object.entries(process.env)) {
          if (envKey?.startsWith(prefix) && envValue !== undefined) {
            const toggleKey = envKey
              .slice(prefix.length)
              .toLowerCase()
              .replace(/_/g, '-')
            this.toggles.set(toggleKey, this.parseOfflineValue(envValue))
          }
        }
        this.offlineTogglesLoaded = true
        console.log(
          '[Togglely] Loaded offline toggles from environment variables'
        )
      }
    } catch (error) {
      console.warn('[Togglely] Failed to load offline toggles:', error)
    }
  }

  private async loadOfflineJsonFile(path: string): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const response = await fetch(path)
        if (response.ok) {
          const data = await response.json()
          for (const [key, value] of Object.entries(data)) {
            this.toggles.set(key, this.parseOfflineValue(value))
          }
          this.offlineTogglesLoaded = true
          console.log('[Togglely] Loaded offline toggles from JSON file:', path)
        }
      } else if (typeof require !== 'undefined') {
        const fs = require('fs')
        const pathModule = require('path')
        const fullPath = pathModule.resolve(path)
        if (fs.existsSync(fullPath)) {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
          for (const [key, value] of Object.entries(data)) {
            this.toggles.set(key, this.parseOfflineValue(value))
          }
          this.offlineTogglesLoaded = true
          console.log(
            '[Togglely] Loaded offline toggles from JSON file:',
            fullPath
          )
        }
      }
    } catch (error) {
      console.warn('[Togglely] Failed to load offline JSON file:', error)
    }
  }

  private parseOfflineValue(value: any): ToggleValue {
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return { value: true, enabled: true }
      if (lower === 'false') return { value: false, enabled: true }
      if (!isNaN(Number(value))) {
        return { value: Number(value), enabled: true }
      }
      try {
        const parsed = JSON.parse(value)
        return { value: parsed, enabled: true }
      } catch {
        return { value, enabled: true }
      }
    }
    return { value, enabled: true }
  }

  async refresh(): Promise<void> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = this.performRefresh().finally(() => {
      this.inFlightRefresh = null
    })

    return this.inFlightRefresh
  }

  private async performRefresh(): Promise<void> {
    try {
      const params = new URLSearchParams()
      if (this.context.brandKey)
        params.set('brandKey', String(this.context.brandKey))
      if (this.context.tenantId)
        params.set('tenantId', String(this.context.tenantId))
      if (Object.keys(this.context).length > 0) {
        params.set('context', JSON.stringify(this.context))
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }

      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/flags/${encodeURIComponent(this.config.project)}/${encodeURIComponent(this.config.environment)}?${params.toString()}`,
        { headers }
      )

      if (!response.ok) {
        throw new TogglelyNetworkError(
          `HTTP ${response.status}`,
          response.status,
          response
        )
      }

      const data: AllTogglesResponse = await response.json()
      const changed = this.replaceTogglesIfChanged(data)

      this.state.lastFetch = new Date()
      this.state.lastError = null
      this.lastRefreshTime = Date.now()

      if (!this.state.isReady) {
        this.state.isReady = true
        this.emit('ready')
      }

      if (this.state.isOffline) {
        this.state.isOffline = false
        this.emit('online')
      }

      if (changed) {
        this.emit('update')
      }
    } catch (error) {
      this.state.lastError = error as Error

      if (
        this.config.offlineFallback &&
        this.offlineTogglesLoaded &&
        !this.state.isOffline
      ) {
        this.state.isOffline = true
        this.emit('offline')
      }

      this.emit('error')
      console.error('[Togglely] Failed to refresh toggles:', error)
      throw error
    }
  }

  private replaceTogglesIfChanged(next: AllTogglesResponse): boolean {
    const current = this.getAllToggles()
    const currentSerialized = JSON.stringify(
      current,
      Object.keys(current).sort()
    )
    const nextSerialized = JSON.stringify(next, Object.keys(next).sort())

    if (currentSerialized === nextSerialized) {
      return false
    }

    this.toggles.clear()
    for (const [key, value] of Object.entries(next)) {
      this.toggles.set(key, value)
    }
    return true
  }

  /**
   * Track a conversion event for an experiment.
   */
  async trackConversion(
    experimentKey: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const userId = this.context.userId
    if (!userId) return

    const event: ExperimentTrackingEvent = {
      experimentKey,
      variantKey: '',
      userId: String(userId),
      type: 'conversion',
      timestamp: Date.now(),
    }

    if (this.config.trackingCallback) {
      this.config.trackingCallback(event)
    }

    this.pendingEvents.push(event)
    this.scheduleEventFlush()
  }

  private trackExposureIfNeeded(toggleValue: ToggleValue, flagKey: string): void {
    if (!toggleValue.experiment) return
    if (this.config.enableExposureTracking === false) return

    const userId = this.context.userId
    if (!userId) return

    const dedupKey = `${toggleValue.experiment.key}:${userId}`
    if (this.trackedExposures.has(dedupKey)) return
    this.trackedExposures.add(dedupKey)

    const event: ExperimentTrackingEvent = {
      experimentKey: toggleValue.experiment.key,
      variantKey: toggleValue.experiment.variantKey,
      userId: String(userId),
      type: 'exposure',
      timestamp: Date.now(),
      flagKey,
    }

    if (this.config.trackingCallback) {
      this.config.trackingCallback(event)
    }

    this.pendingEvents.push(event)
    this.scheduleEventFlush()
  }

  private scheduleEventFlush(): void {
    if (this.pendingEvents.length >= this.EVENT_BATCH_SIZE) {
      this.flushEvents()
      return
    }

    if (!this.eventFlushTimeout) {
      this.eventFlushTimeout = setTimeout(() => {
        this.eventFlushTimeout = null
        this.flushEvents()
      }, this.EVENT_FLUSH_INTERVAL)
    }
  }

  private async flushEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) return
    if (this.state.isOffline) return

    const events = [...this.pendingEvents]
    this.pendingEvents = []

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }

      await this.fetchWithTimeout(
        `${this.config.baseUrl}/sdk/events/${encodeURIComponent(this.config.project)}/${encodeURIComponent(this.config.environment)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            events: events.map((e) => ({
              type: e.type,
              experimentKey: e.experimentKey,
              variantKey: e.variantKey,
              userId: e.userId,
              timestamp: e.timestamp,
            })),
          }),
        }
      )
    } catch {
      // Re-queue events on failure
      this.pendingEvents.unshift(...events)
    }
  }

  forceOfflineMode(): void {
    this.state.isOffline = true
    this.emit('offline')
  }

  forceOnlineMode(): void {
    this.state.isOffline = false
    this.refresh().catch(() => {})
    this.emit('online')
  }

  destroy(): void {
    this.flushEvents().catch(() => {})
    this.toggles.clear()
    this.trackedExposures.clear()
    this.eventHandlers.forEach((handlers) => handlers.clear())
    if (this.batchTimeout) clearTimeout(this.batchTimeout)
    if (this.refreshTimeout) clearTimeout(this.refreshTimeout)
    if (this.intervalHandle) clearInterval(this.intervalHandle)
    if (this.eventFlushTimeout) clearTimeout(this.eventFlushTimeout)
    this.batchTimeout = null
    this.refreshTimeout = null
    this.intervalHandle = null
    this.eventFlushTimeout = null
  }

  private fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TogglelyTimeoutError())
      }, this.config.timeout)

      fetch(url, options)
        .then((response) => {
          clearTimeout(timeoutId)
          resolve(response)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          if (error instanceof TogglelyError) {
            reject(error)
          } else {
            reject(
              new TogglelyNetworkError(
                error instanceof Error ? error.message : String(error)
              )
            )
          }
        })
    })
  }
}

export function createOfflineTogglesScript(
  toggles: Record<string, any>
): string {
  return `<script>window.__TOGGLELY_TOGGLES = ${JSON.stringify(toggles)};</script>`
}

export function togglesToEnvVars(
  toggles: Record<string, any>,
  prefix: string = 'TOGGLELY_'
): Record<string, string> {
  const envVars: Record<string, string> = {}
  for (const [key, value] of Object.entries(toggles)) {
    const envKey = prefix + key.toUpperCase().replace(/-/g, '_')
    envVars[envKey] =
      typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return envVars
}

export default TogglelyClient
