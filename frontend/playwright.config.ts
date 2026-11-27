import { defineConfig, devices } from '@playwright/test'

// A dedicated port so a running `npm run dev` (:5173) is never mistaken for the server under test.
const PORT = Number(process.env.E2E_PORT ?? 5190)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? 'true' },
  },
})
