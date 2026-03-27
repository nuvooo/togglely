/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // Instrument code for coverage in test mode
    process.env.NODE_ENV === 'test' && {
      name: 'istanbul',
      transform(code, id) {
        if (id.includes('node_modules')) return
        if (!id.includes('src')) return
        if (!/\.(tsx?|jsx?)$/.test(id)) return

        // This is a simplified version - in production you'd use vite-plugin-istanbul
        return code
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
