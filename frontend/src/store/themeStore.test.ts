import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from './themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({
      theme: 'system',
      resolvedTheme: 'light',
    })
    localStorage.clear()
  })

  it('should have system as default theme', () => {
    const state = useThemeStore.getState()
    expect(state.theme).toBe('system')
  })

  it('should update theme via setTheme', () => {
    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })

  it('should toggle theme from light to dark', () => {
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })

  it('should toggle theme from dark to light', () => {
    useThemeStore.setState({ theme: 'dark', resolvedTheme: 'dark' })
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(useThemeStore.getState().resolvedTheme).toBe('light')
  })

  it('should set theme to light explicitly', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    expect(useThemeStore.getState().resolvedTheme).toBe('light')
  })
})
