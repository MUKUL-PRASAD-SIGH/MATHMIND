import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * Two modes (T7.3):
 *   npx playwright test              → MSW mocks in the browser, no backend. Runs *.spec.ts.
 *   E2E_REAL=1 npx playwright test   → also starts the real backend (temp SQLite, Ollama pointed
 *                                      at a dead port, so AI is "unavailable"). Runs *.real.spec.ts.
 * Dedicated ports so a running `npm run dev` (:5173) or API (:8000) is never mistaken for the server under test.
 */
const REAL = process.env.E2E_REAL === '1'
const PORT = Number(process.env.E2E_PORT ?? (REAL ? 5191 : 5190))
const API_PORT = Number(process.env.E2E_API_PORT ?? 8790)

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../backend')
const python =
  process.env.E2E_PYTHON ??
  [join(backendDir, '.venv/Scripts/python.exe'), join(backendDir, '.venv/bin/python')].find((p) =>
    existsSync(p),
  ) ??
  'python'
const runDir = join(tmpdir(), `mathmind-e2e-${Date.now()}`)

const laptop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
const tablet = { ...devices['iPad Pro 11'], defaultBrowserType: 'chromium' as const }
const phone = { ...devices['iPhone 13'], defaultBrowserType: 'chromium' as const }
// Specs that make sense on touch devices; everything else is laptop/keyboard only.
const touchSpecs = /(notebook|offline|image-review|ocr-uncertain|perf)\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  testMatch: REAL ? /\.real\.spec\.ts$/ : /(?<!\.real)\.spec\.ts$/,
  fullyParallel: !REAL, // the real backend has one learner: keep its specs in order
  workers: REAL ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: REAL
    ? [{ name: 'laptop', use: laptop }]
    : [
        { name: 'laptop', use: laptop },
        { name: 'tablet', use: tablet, testMatch: touchSpecs },
        { name: 'phone', use: phone, testMatch: touchSpecs },
      ],
  webServer: [
    ...(REAL
      ? [
          {
            command: `"${python}" -m uvicorn app.main:app --port ${API_PORT}`,
            cwd: backendDir,
            url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              DATABASE_URL: `sqlite:///${join(runDir, 'e2e.db').replace(/\\/g, '/')}`,
              UPLOAD_DIR: join(runDir, 'uploads'),
              OLLAMA_URL: 'http://127.0.0.1:9', // nothing listens here: AI unavailable (R3)
              CORS_ORIGINS: `["http://localhost:${PORT}"]`,
            },
          },
        ]
      : []),
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      env: {
        VITE_USE_MOCKS: REAL ? 'false' : (process.env.VITE_USE_MOCKS ?? 'true'),
        VITE_API_BASE_URL: '',
        VITE_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
})
