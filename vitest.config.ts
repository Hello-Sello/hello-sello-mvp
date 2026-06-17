import { defineConfig } from "vitest/config";

/**
 * Vitest config - the repo's FIRST unit runner (added in phase 3a / plan 01).
 *
 * Scoped to `src/**` ONLY so it can never pick up the Playwright specs in
 * `e2e/` (those run via the separate `npm test` script with a forced async
 * loader). The unit suite is pure-math over `src/modules/deals/lib/derive.ts`,
 * so the node environment is enough - no jsdom, no React, no DB/app setup.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
