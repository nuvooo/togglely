import { describe, expect, it } from 'vitest'
import api from './api'
import legacy from './axios'

describe('api client', () => {
  it('is one shared instance for @/lib/api and @/lib/axios', () => {
    expect(legacy).toBe(api)
  })

  it('uses VITE_API_URL or /api as base URL', () => {
    expect(api.defaults.baseURL).toBe(import.meta.env.VITE_API_URL || '/api')
  })
})
