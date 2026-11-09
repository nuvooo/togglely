import axios from 'axios'
import { expireSession } from './session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only a request that carried a session can expire it; a 401 without
    // one (wrong login credentials) must stay on the page with its error.
    if (
      error.response?.status === 401 &&
      error.config?.headers?.Authorization
    ) {
      expireSession()
    }
    return Promise.reject(error)
  }
)

export default api
