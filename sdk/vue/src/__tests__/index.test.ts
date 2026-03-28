jest.mock('@togglely/sdk-core', () => ({
  TogglelyClient: jest.fn().mockImplementation(() => ({
    isEnabled: jest.fn().mockResolvedValue(false),
    getValue: jest.fn().mockResolvedValue({ enabled: false }),
    getString: jest.fn().mockResolvedValue(''),
    getNumber: jest.fn().mockResolvedValue(0),
    getJSON: jest.fn().mockResolvedValue(null),
    getAllToggles: jest.fn().mockReturnValue({}),
    getState: jest.fn().mockReturnValue({
      isReady: false,
      isOffline: false,
      lastError: null,
      lastFetch: null,
    }),
    on: jest.fn().mockReturnValue(jest.fn()),
    off: jest.fn(),
    destroy: jest.fn(),
    refresh: jest.fn(),
    setContext: jest.fn(),
    getContext: jest.fn().mockReturnValue({}),
    clearContext: jest.fn(),
  })),
}))

import { createApp, defineComponent, h } from 'vue'
import {
  createTogglely,
  vFeatureToggle,
  useTogglelyClient,
  useTogglelyContext,
} from '../index'

const testConfig = {
  apiKey: 'test-key',
  project: 'test-project',
  environment: 'development',
  baseUrl: 'https://test.togglely.io',
} as any

describe('Vue SDK', () => {
  describe('createTogglely', () => {
    it('returns a Vue plugin with install method', () => {
      const plugin = createTogglely(testConfig)

      expect(plugin).toBeDefined()
      expect(plugin).toHaveProperty('install')
      expect(typeof plugin.install).toBe('function')
    })

    it('can be installed on a Vue app', () => {
      const plugin = createTogglely(testConfig)

      const app = createApp(defineComponent({
        render() {
          return h('div', 'test')
        },
      }))

      expect(() => {
        app.use(plugin)
      }).not.toThrow()
    })

    it('sets $togglely on global properties after install', () => {
      const plugin = createTogglely(testConfig)

      const app = createApp(defineComponent({
        render() {
          return h('div', 'test')
        },
      }))

      app.use(plugin)

      expect(app.config.globalProperties.$togglely).toBeDefined()
    })
  })

  describe('vFeatureToggle directive', () => {
    it('exists and has lifecycle hooks', () => {
      expect(vFeatureToggle).toBeDefined()
      expect(vFeatureToggle).toHaveProperty('mounted')
      expect(vFeatureToggle).toHaveProperty('updated')
      expect(vFeatureToggle).toHaveProperty('unmounted')
    })

    it('mounted is a function', () => {
      expect(typeof vFeatureToggle.mounted).toBe('function')
    })
  })

  describe('exports', () => {
    it('exports all expected functions', () => {
      expect(createTogglely).toBeDefined()
      expect(typeof createTogglely).toBe('function')
      expect(useTogglelyClient).toBeDefined()
      expect(typeof useTogglelyClient).toBe('function')
      expect(useTogglelyContext).toBeDefined()
      expect(typeof useTogglelyContext).toBe('function')
    })
  })
})
