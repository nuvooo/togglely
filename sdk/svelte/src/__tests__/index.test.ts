const mockDestroy = jest.fn()
const mockOn = jest.fn().mockReturnValue(jest.fn())
const mockIsEnabled = jest.fn().mockResolvedValue(false)
const mockGetState = jest.fn().mockReturnValue({
  isReady: false,
  isOffline: false,
  lastError: null,
  lastFetch: null,
})
const mockGetAllToggles = jest.fn().mockReturnValue({})
const mockSetContext = jest.fn()
const mockGetContext = jest.fn().mockReturnValue({})
const mockClearContext = jest.fn()

jest.mock('@togglely/sdk-core', () => ({
  TogglelyClient: jest.fn().mockImplementation(() => ({
    isEnabled: mockIsEnabled,
    getValue: jest.fn().mockResolvedValue({ enabled: false }),
    getString: jest.fn().mockResolvedValue(''),
    getNumber: jest.fn().mockResolvedValue(0),
    getJSON: jest.fn().mockResolvedValue(null),
    getAllToggles: mockGetAllToggles,
    getState: mockGetState,
    on: mockOn,
    off: jest.fn(),
    destroy: mockDestroy,
    refresh: jest.fn(),
    setContext: mockSetContext,
    getContext: mockGetContext,
    clearContext: mockClearContext,
  })),
}))

import {
  initTogglely,
  getTogglelyClient,
  destroyTogglely,
  toggle,
  togglelyState,
  toggles,
  setTogglelyContext,
  getTogglelyContext,
  clearTogglelyContext,
} from '../index'

describe('Svelte SDK', () => {
  const config = {
    apiKey: 'test-key',
    project: 'test-project',
    environment: 'development',
    baseUrl: 'https://test.togglely.io',
  }

  afterEach(() => {
    destroyTogglely()
    jest.clearAllMocks()
  })

  describe('initTogglely', () => {
    it('creates a client instance', () => {
      const client = initTogglely(config)
      expect(client).toBeDefined()
    })

    it('allows retrieval via getTogglelyClient', () => {
      initTogglely(config)
      const client = getTogglelyClient()
      expect(client).toBeDefined()
    })

    it('destroys old instance when reinitializing', () => {
      initTogglely(config)
      initTogglely(config)
      expect(mockDestroy).toHaveBeenCalledTimes(1)
    })
  })

  describe('getTogglelyClient', () => {
    it('throws when not initialized', () => {
      expect(() => getTogglelyClient()).toThrow(
        'Togglely not initialized. Call initTogglely first.'
      )
    })
  })

  describe('toggle()', () => {
    it('returns a readable store', () => {
      initTogglely(config)
      const store = toggle('test-feature', false)

      expect(store).toBeDefined()
      expect(store.subscribe).toBeDefined()
      expect(typeof store.subscribe).toBe('function')
    })

    it('store emits default value initially', () => {
      initTogglely(config)
      const store = toggle('test-feature', false)

      let value: boolean | undefined
      const unsubscribe = store.subscribe((v) => {
        value = v
      })

      expect(value).toBe(false)
      unsubscribe()
    })
  })

  describe('togglelyState()', () => {
    it('returns a readable store', () => {
      initTogglely(config)
      const store = togglelyState()

      expect(store).toBeDefined()
      expect(store.subscribe).toBeDefined()
      expect(typeof store.subscribe).toBe('function')
    })

    it('store emits initial state', () => {
      initTogglely(config)
      const store = togglelyState()

      let state: any
      const unsubscribe = store.subscribe((v) => {
        state = v
      })

      expect(state).toHaveProperty('isReady', false)
      expect(state).toHaveProperty('isOffline', false)
      unsubscribe()
    })
  })

  describe('destroyTogglely', () => {
    it('cleans up the client', () => {
      initTogglely(config)
      destroyTogglely()

      expect(mockDestroy).toHaveBeenCalled()
      expect(() => getTogglelyClient()).toThrow()
    })

    it('does nothing if not initialized', () => {
      expect(() => destroyTogglely()).not.toThrow()
    })
  })

  describe('context helpers', () => {
    it('setTogglelyContext calls client.setContext', () => {
      initTogglely(config)
      setTogglelyContext({ userId: '123' })
      expect(mockSetContext).toHaveBeenCalledWith({ userId: '123' })
    })

    it('getTogglelyContext calls client.getContext', () => {
      initTogglely(config)
      getTogglelyContext()
      expect(mockGetContext).toHaveBeenCalled()
    })

    it('clearTogglelyContext calls client.clearContext', () => {
      initTogglely(config)
      clearTogglelyContext()
      expect(mockClearContext).toHaveBeenCalled()
    })
  })

  describe('exports', () => {
    it('exports all expected functions', () => {
      expect(initTogglely).toBeDefined()
      expect(getTogglelyClient).toBeDefined()
      expect(destroyTogglely).toBeDefined()
      expect(toggle).toBeDefined()
      expect(togglelyState).toBeDefined()
      expect(toggles).toBeDefined()
    })
  })
})
