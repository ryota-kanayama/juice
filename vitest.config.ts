import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('frontend/renderer/src'),
      '@': resolve('frontend/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./frontend/renderer/src/test/setup.ts'],
    include: ['frontend/**/*.test.{ts,tsx}', 'frontend/**/*.spec.{ts,tsx}', 'lambda/src/**/*.test.ts'],
  }
})
