/**
 * Phase 06.1 — Social Sign-In & Email Verification E2E spec.
 *
 * This file is SHARED across the phase: plan 06.1-02 (this set) owns the
 * proxy-level routing assertions; plan 06.1-04 fills the `test.fixme`
 * placeholders at the bottom (signup → verify screen, resend cooldown).
 * Keep additions additive — do not rewrite the routing block below.
 *
 * --- What 06.1-02 proves -------------------------------------------------
 * The proxy public-route allowlist (src/shared/db/proxy.ts) now lets a
 * signed-OUT user reach the three auth-flow routes without being bounced to
 * /login, WHILE a control gated route still redirects. This guards against the
 * change silently opening the whole app.
 *
 *   Test A  /auth/confirm          → proxy lets it through (handler = plan 03)
 *   Test B  /auth/callback         → proxy lets it through (handler = plan 03)
 *   Test C  /home (control)        → still redirects to /login             GREEN
 *
 * Tests A and B assert ONLY the proxy contract: "the gate does not redirect
 * this route to /login". The /auth/callback and /auth/confirm Route Handlers
 * do not exist yet (plan 06.1-03), so a signed-out hit currently resolves to a
 * 404 from Next, NOT a /login redirect — which is exactly the proxy behaviour
 * we want to lock. The full handler behaviour (code/token exchange →
 * /login?error=… or /onboarding) is covered by `test.fixme` stubs pointing to
 * plan 03.
 *
 * --- /verify-email: proxy is open, but the PAGE still self-gates ----------
 * The proxy now allowlists /verify-email (06.1-02). But verify-email/page.tsx
 * still calls getCurrentUser() and redirects a session-less visitor to /login
 * (research Pitfall 4). So a signed-out user is bounced by the PAGE, not the
 * proxy. Reworking that page to read ?email= instead is plan 06.1-04's task
 * (CONTEXT: "verify screen rework"). The full-reachability assertion therefore
 * lives in a `test.fixme` below pointing to plan 04 — asserting it here would
 * fail for a reason this plan does not own.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// ---------------------------------------------------------------------------
// Signed-out helper — fresh context, no cookies, no localStorage.
// Mirrors the signed-out setup in e2e/auth-gate.spec.ts (which clears cookies
// before signing in); here we simply never sign in.
// ---------------------------------------------------------------------------
async function ensureSignedOut(page: Page, context: BrowserContext): Promise<void> {
  await context.clearCookies()
  // localStorage can only be cleared once a document is loaded; do it after the
  // first navigation in each test if needed. Cookies are what the proxy gate
  // reads, so clearing them is sufficient to be "signed out" for the gate.
}

// ---------------------------------------------------------------------------
// Test A — /auth/confirm passes the proxy gate (handler arrives in plan 03).
// Proxy-level contract only: a signed-out hit is NOT redirected to /login.
// Until the handler exists this resolves to a 404, which still satisfies
// "the gate let it through". The handler's own redirect to /login?error=confirm
// is asserted by the fixme stub below.
// ---------------------------------------------------------------------------
test('signed-out user reaching /auth/confirm is not gated out to /login', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/auth/confirm')
  // The proxy gate must not bounce a public route to /login. (No ?token_hash so
  // the future handler would redirect to /login?error=confirm — distinct from a
  // bare /login gate redirect, and not yet present anyway.)
  expect(new URL(page.url()).pathname).not.toBe('/login')
})

// ---------------------------------------------------------------------------
// Test B — /auth/callback passes the proxy gate (handler arrives in plan 03).
// Same proxy-level contract as Test A.
// ---------------------------------------------------------------------------
test('signed-out user reaching /auth/callback is not gated out to /login', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/auth/callback')
  expect(new URL(page.url()).pathname).not.toBe('/login')
})

// ---------------------------------------------------------------------------
// Test C (control) — a still-gated route STILL redirects signed-out users.
// Proves the allowlist change did not globally weaken the gate. GREEN.
// ---------------------------------------------------------------------------
test('control: signed-out user on a gated route still redirects to /login', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/home')
  await page.waitForURL((url) => url.pathname === '/login', { timeout: 10_000 })
  expect(new URL(page.url()).pathname).toBe('/login')
})

// ===========================================================================
// Placeholders owned by plan 06.1-04 — DO NOT implement here.
// These go GREEN once signup redirects to the verify screen and the resend
// button has its cooldown. Left as `fixme` so the suite stays green meanwhile.
// ===========================================================================

test.fixme(
  'signed-out user can fully load /verify-email?email= (unblocked by plan 06.1-04)',
  async ({ page, context }) => {
    // The proxy already allows /verify-email (06.1-02). This stays RED until
    // plan 06.1-04 reworks verify-email/page.tsx to read ?email= instead of
    // calling getCurrentUser() (which redirects a session-less visitor to
    // /login). Once that lands, this asserts the page renders and the URL stays
    // on /verify-email.
    await ensureSignedOut(page, context)
    await page.goto('/verify-email?email=x@y.test')
    await expect(page).toHaveURL(/\/verify-email/)
    expect(page.url()).not.toContain('/login')
  },
)

test.fixme('signup → lands on /verify-email?email= (plan 06.1-04)', async () => {
  // Submitting the signup form with confirmation ON returns no session and
  // redirects to /verify-email?email=<encoded>. Implemented in plan 06.1-04.
})

test.fixme('resend button disables for cooldown (plan 06.1-04)', async () => {
  // The verify screen's "Resend" link disables for the cooldown window
  // (~45s per research) after a click. Implemented in plan 06.1-04.
})
