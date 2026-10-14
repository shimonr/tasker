import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The app calls same-origin /api; in development forward it to the FastAPI server.
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    clearMocks: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts', 'src/types.ts', 'src/test/**'],
      reporter: ['text', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
