import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { AUTH_STORAGE_KEY, onSessionExpired } from '@/lib/session'

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
      },

      logout: () => {
        set({ token: null, user: null, error: null })
        // Token key of older builds; the persisted store is the only source now.
        localStorage.removeItem('token')
      },

      setToken: (token) => {
        set({ token })
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
      // The persisted token is what the API client sends (lib/session).
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)

// An expired session (401 from the API) also logs out in memory; otherwise the
// store would keep the dead token and GuestOnly would bounce /login back.
onSessionExpired(() => useAuthStore.getState().logout())
