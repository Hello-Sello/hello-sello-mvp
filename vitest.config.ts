import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config - the repo's FIRST unit runner (added in phase 3a / plan 01).
 *
 * Scoped to `src/**` ONLY so it can never pick up the Playwright specs in
 * `e2e/` (those run via the separate `npm test` script with a forced async
 * loader). The original suite is pure-math over `src/modules/deals/lib/derive.ts`,
 * so the node environment is enough - no jsdom, no DB/app setup.
 *
 * Phase 10 (10-01) extends the glob to `*.test.tsx` for the <VerifiedBadge> render
 * test. It renders via `react-dom/server` `renderToStaticMarkup`, so the node env
 * still suffices — no jsdom and no @testing-library needed. Vitest 4's oxc transform
 * handles the JSX (automatic runtime) with no extra config.
 *
 * Phase 12 (12-01) aliases `server-only` to an empty stand-in so the Path-B
 * server-action unit specs can import 'use server' modules that transitively pull
 * in Next's vendored `server-only` marker (team/actions.ts → @/shared/db/admin).
 * That marker only throws when bundled into a Client Component — never under the
 * unit runner — so the empty module is a zero-effect stand-in.
 */
export default defineConfig({
  // Mirror the tsconfig `@/* -> ./src/*` path alias so specs can import app code.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-shim.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // HEL-86 adds the second glob. The `src/**` scoping above exists to keep
    // the Playwright specs in `e2e/` out; naming `supabase/functions` explicitly
    // does not reopen that (and `exclude` still names `e2e/**` anyway). It picks
    // up ONE spec: the edge-function relationship-gate classifier, which is
    // deliberately pure — no Deno globals, no `npm:`/`jsr:` imports — precisely
    // so it can be covered here. Anything under `supabase/functions` that
    // touches `Deno.*` is not unit-testable by this runner and must not grow a
    // `.test.ts` next to it.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "supabase/functions/**/*.test.ts",
    ],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
