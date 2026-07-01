import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('front/renderer/src'),
      '@': resolve('front/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./front/renderer/src/test/setup.ts'],
    include: ['front/**/*.test.{ts,tsx}', 'front/**/*.spec.{ts,tsx}', 'lambda/src/**/*.test.ts'],
  }
})
