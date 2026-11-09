import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'

export interface User {
  id: string
  email: string
  name: string
  role?: string
  emailVerified?: boolean
}

/** `{ token, user }` as returned by login, setup and invite registration. */
export interface SessionResponse {
  token: string
  user: User
}

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  /** Stores a session returned by the API (login, setup, invite registration). */
  setSession: (session: SessionResponse) => void
  logout: () => void
  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  updateUser: (user: Partial<User>) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await api.post('/auth/login', { email, password })
          get().setSession(response.data)
          set({ isLoading: false })
        } catch (error: unknown) {
          set({
            error: getErrorMessage(error),
            isLoading: false,
          })
          throw error
        }
      },

      setSession: ({ token, user }) => {
        set({ token, user, error: null })
        localStorage.setItem('token', token)
      },

      logout: () => {
        set({ token: null, user: null, error: null })
        localStorage.removeItem('token')
      },

      setToken: (token) => {
        set({ token })
        if (token) {
          localStorage.setItem('token', token)
        } else {
          localStorage.removeItem('token')
        }
      },

      setUser: (user) => {
        set({ user })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }))
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)
