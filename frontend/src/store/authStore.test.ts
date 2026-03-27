import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from './authStore'

// Mock axios module
vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      token: null,
      user: null,
      isLoading: false,
      error: null,
    })
    localStorage.clear()
  })

  it('should have correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should update token via setToken', () => {
    useAuthStore.getState().setToken('test-token-123')
    const state = useAuthStore.getState()
    expect(state.token).toBe('test-token-123')
    expect(localStorage.getItem('token')).toBe('test-token-123')
  })

  it('should remove token from localStorage when setToken(null)', () => {
    localStorage.setItem('token', 'old-token')
    useAuthStore.getState().setToken(null)
    expect(useAuthStore.getState().token).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('should set user via setUser', () => {
    const user = { id: '1', email: 'test@example.com', name: 'Test', role: 'admin' }
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('should clear state on logout', () => {
    useAuthStore.setState({
      token: 'some-token',
      user: { id: '1', email: 'a@b.com', name: 'A', role: 'admin' },
      error: 'some error',
    })
    localStorage.setItem('token', 'some-token')

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.error).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('should update user partially via updateUser', () => {
    const user = { id: '1', email: 'test@example.com', name: 'Test', role: 'admin' }
    useAuthStore.setState({ user })

    useAuthStore.getState().updateUser({ name: 'Updated' })
    expect(useAuthStore.getState().user?.name).toBe('Updated')
    expect(useAuthStore.getState().user?.email).toBe('test@example.com')
  })

  it('should clear error via clearError', () => {
    useAuthStore.setState({ error: 'something went wrong' })
    useAuthStore.getState().clearError()
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('should login successfully', async () => {
    const { default: api } = await import('@/lib/axios')
    const mockResponse = {
      data: {
        token: 'jwt-token',
        user: { id: '1', email: 'test@example.com', name: 'Test', role: 'admin' },
      },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    await useAuthStore.getState().login('test@example.com', 'password')

    const state = useAuthStore.getState()
    expect(state.token).toBe('jwt-token')
    expect(state.user?.email).toBe('test@example.com')
    expect(state.isLoading).toBe(false)
  })

  it('should set error on login failure', async () => {
    const { default: api } = await import('@/lib/axios')
    const error = new Error('Invalid credentials')
    Object.assign(error, { isAxiosError: true, response: { data: { message: 'Invalid credentials' } } })
    vi.mocked(api.post).mockRejectedValueOnce(error)

    await expect(useAuthStore.getState().login('bad@example.com', 'wrong')).rejects.toThrow()

    const state = useAuthStore.getState()
    expect(state.error).toBe('Invalid credentials')
    expect(state.isLoading).toBe(false)
  })
})
