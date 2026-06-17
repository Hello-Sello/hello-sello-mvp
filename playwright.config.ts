import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config — slice 0 of the go-to-market test harness.
 * Tests live in ./e2e and run against a locally-started `next dev` server.
 *
 * NOTE on the loader: the `npm test` / `npm run test:ui` scripts set
 * PLAYWRIGHT_FORCE_ASYNC_LOADER=1 (see package.json). Playwright 1.61 on
 * Node 22.15/24 crashes in its synchronous ESM resolve hook
 * (`context.conditions?.includes is not a function`) the moment a spec imports
 * a relative TS module (our e2e/fixtures/*). The env var forces the working
 * async loader. It MUST live in the env (set before the runner starts), not in
 * this config — Playwright registers its loader before reading the config, so a
 * value set here would be too late. Drop a direct `playwright test` invocation
 * with the same env var, or just use `npm test`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
