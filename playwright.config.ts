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
  // ONE worker, always: every spec hits the SAME local Supabase, and the deal
  // specs (deal-change, chat-phase7, deal-c2c-create) all reset + mint deals on
  // the ONE seeded GreenLeaf<->StonePharm relationship. Two workers running two
  // of those files concurrently wipe each other's cards mid-test (proven:
  // deal-change's birth hangs on "Start a deal" when deal-c2c-create runs
  // beside it). Per-file `serial` mode cannot protect across files.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    // Must match the auth `site_url` host (config.toml) one-for-one. The browser
    // treats localhost and 127.0.0.1 as distinct cookie hosts, so a mismatch drops
    // the session cookie set on the confirm redirect and breaks every auth
    // round-trip (recovery/email-change). Next dev reports request.url on the
    // `localhost` canonical host, so the whole stack is pinned to localhost.
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
