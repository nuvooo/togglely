const mockIsEnabled = jest.fn().mockResolvedValue(false)
const mockGetString = jest.fn().mockResolvedValue('hello')
const mockGetNumber = jest.fn().mockResolvedValue(42)
const mockGetJSON = jest.fn().mockResolvedValue({ theme: 'dark' })
const mockDestroy = jest.fn()

jest.mock('@togglely/sdk-core', () => ({
  TogglelyClient: jest.fn().mockImplementation(() => ({
    isEnabled: mockIsEnabled,
    getValue: jest.fn().mockResolvedValue({ enabled: false }),
    getString: mockGetString,
    getNumber: mockGetNumber,
    getJSON: mockGetJSON,
    getAllToggles: jest.fn().mockReturnValue({}),
    getState: jest.fn().mockReturnValue({
      isReady: false,
      isOffline: false,
      lastError: null,
      lastFetch: null,
    }),
    on: jest.fn().mockReturnValue(jest.fn()),
    off: jest.fn(),
    destroy: mockDestroy,
    refresh: jest.fn(),
    setContext: jest.fn(),
    getContext: jest.fn().mockReturnValue({}),
    clearContext: jest.fn(),
  })),
}))

import {
  initTogglely,
  getGlobalTogglely,
  isEnabled,
  getString,
  getNumber,
  getJSON,
  TogglelyClient,
} from '../index'

describe('Vanilla SDK', () => {
  const config = {
    apiKey: 'test-key',
    project: 'test-project',
    environment: 'development',
    baseUrl: 'https://test.togglely.io',
  }

  afterEach(() => {
    // Clean up global instance
    delete (window as any).togglely
    jest.clearAllMocks()
  })

  describe('initTogglely', () => {
    it('creates a global instance', () => {
      const client = initTogglely(config)
      expect(client).toBeDefined()
    })

    it('sets window.togglely', () => {
      initTogglely(config)
      expect((window as any).togglely).toBeDefined()
    })
  })

  describe('getGlobalTogglely', () => {
    it('returns the instance after init', () => {
      initTogglely(config)
      const client = getGlobalTogglely()
      expect(client).toBeDefined()
    })

    it('returns null when not initialized', () => {
      const client = getGlobalTogglely()
      expect(client).toBeNull()
    })
  })

  describe('isEnabled', () => {
    it('returns boolean value', async () => {
      initTogglely(config)
      const result = await isEnabled('test-feature', false)
      expect(typeof result).toBe('boolean')
    })

    it('returns default value when no global instance', async () => {
      const result = await isEnabled('test-feature', true)
      expect(result).toBe(true)
    })

    it('calls client.isEnabled with correct args', async () => {
      initTogglely(config)
      await isEnabled('my-feature', false)
      expect(mockIsEnabled).toHaveBeenCalledWith('my-feature', false)
    })
  })

  describe('getString', () => {
    it('returns string value', async () => {
      initTogglely(config)
      const result = await getString('welcome-msg', 'default')
      expect(typeof result).toBe('string')
    })

    it('returns default value when no global instance', async () => {
      const result = await getString('welcome-msg', 'fallback')
      expect(result).toBe('fallback')
    })
  })

  describe('getNumber', () => {
    it('returns number value', async () => {
      initTogglely(config)
      const result = await getNumber('max-items', 10)
      expect(typeof result).toBe('number')
    })

    it('returns default value when no global instance', async () => {
      const result = await getNumber('max-items', 99)
      expect(result).toBe(99)
    })
  })

  describe('getJSON', () => {
    it('returns parsed JSON value', async () => {
      initTogglely(config)
      const result = await getJSON('config', {})
      expect(result).toBeDefined()
    })

    it('returns default value when no global instance', async () => {
      const result = await getJSON('config', { fallback: true })
      expect(result).toEqual({ fallback: true })
    })
  })

  describe('exports', () => {
    it('re-exports TogglelyClient from core', () => {
      expect(TogglelyClient).toBeDefined()
    })

    it('exports all expected helper functions', () => {
      expect(initTogglely).toBeDefined()
      expect(getGlobalTogglely).toBeDefined()
      expect(isEnabled).toBeDefined()
      expect(getString).toBeDefined()
      expect(getNumber).toBeDefined()
      expect(getJSON).toBeDefined()
    })
  })
})
