import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

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

import {
  TogglelyProvider,
  useToggle,
  FeatureToggle,
  useTogglelyClient,
  useTogglelyState,
  useTogglelyReady,
} from '../index'

describe('React SDK', () => {
  const defaultProps = {
    apiKey: 'test-key',
    project: 'test-project',
    environment: 'development',
    baseUrl: 'https://test.togglely.io',
  }

  describe('TogglelyProvider', () => {
    it('renders children correctly', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <div data-testid="child">Hello</div>
        </TogglelyProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByTestId('child')).toHaveTextContent('Hello')
    })

    it('renders multiple children', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </TogglelyProvider>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })
  })

  describe('useToggle hook', () => {
    function TestComponent({ toggleKey, defaultValue }: { toggleKey: string; defaultValue?: boolean }) {
      const isEnabled = useToggle(toggleKey, defaultValue)
      return <div data-testid="toggle-value">{isEnabled ? 'enabled' : 'disabled'}</div>
    }

    it('returns default value when not connected', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <TestComponent toggleKey="test-feature" defaultValue={false} />
        </TogglelyProvider>
      )

      expect(screen.getByTestId('toggle-value')).toHaveTextContent('disabled')
    })

    it('returns true default value when specified', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <TestComponent toggleKey="test-feature" defaultValue={true} />
        </TogglelyProvider>
      )

      expect(screen.getByTestId('toggle-value')).toHaveTextContent('enabled')
    })
  })

  describe('FeatureToggle component', () => {
    it('hides children when toggle is disabled (default)', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <FeatureToggle toggle="disabled-feature">
            <div data-testid="feature-content">Feature Content</div>
          </FeatureToggle>
        </TogglelyProvider>
      )

      expect(screen.queryByTestId('feature-content')).not.toBeInTheDocument()
    })

    it('renders children when defaultValue is true', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <FeatureToggle toggle="enabled-feature" defaultValue={true}>
            <div data-testid="feature-content">Feature Content</div>
          </FeatureToggle>
        </TogglelyProvider>
      )

      expect(screen.getByTestId('feature-content')).toBeInTheDocument()
    })

    it('renders fallback when toggle is disabled', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <FeatureToggle
            toggle="disabled-feature"
            fallback={<div data-testid="fallback">Fallback</div>}
          >
            <div data-testid="feature-content">Feature Content</div>
          </FeatureToggle>
        </TogglelyProvider>
      )

      expect(screen.queryByTestId('feature-content')).not.toBeInTheDocument()
      expect(screen.getByTestId('fallback')).toBeInTheDocument()
    })
  })

  describe('useTogglelyState hook', () => {
    function StateComponent() {
      const state = useTogglelyState()
      return <div data-testid="state">{JSON.stringify(state)}</div>
    }

    it('returns initial state', () => {
      render(
        <TogglelyProvider {...defaultProps}>
          <StateComponent />
        </TogglelyProvider>
      )

      const state = JSON.parse(screen.getByTestId('state').textContent || '{}')
      expect(state).toHaveProperty('isReady')
      expect(state).toHaveProperty('isOffline')
    })
  })

  describe('exports', () => {
    it('exports all expected functions and components', () => {
      expect(TogglelyProvider).toBeDefined()
      expect(useToggle).toBeDefined()
      expect(FeatureToggle).toBeDefined()
      expect(useTogglelyClient).toBeDefined()
      expect(useTogglelyState).toBeDefined()
      expect(useTogglelyReady).toBeDefined()
    })
  })
})
