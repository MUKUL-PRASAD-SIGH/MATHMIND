import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const backend = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env for the monorepo (see ../.env.example: VITE_API_BASE_URL, VITE_USE_MOCKS).
  envDir: '..',
  server: {
    port: 5173,
    // MSW handlers import the shared contract examples from ../shared.
    fs: { allow: ['.', '../shared'] },
    proxy: { '/api': backend },
  },
  preview: {
    port: 4173,
    proxy: { '/api': backend },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
