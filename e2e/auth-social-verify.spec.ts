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
// Test A — /auth/confirm: proxy lets it through AND the handler (plan 03) runs.
// The proxy must not bounce a public route to /login. With the handler now
// present (plan 06.1-03), a token-less hit is no longer a 404 — the handler
// runs verifyOtp's guard (no token_hash/type) and redirects to
// /login?error=confirm. The `error=confirm` marker is what distinguishes a
// HANDLER redirect from a bare proxy gate redirect (which carries no query):
// its presence proves the gate let the request reach the handler.
// ---------------------------------------------------------------------------
test('signed-out user reaching /auth/confirm is handled (not gated to bare /login)', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/auth/confirm')
  const url = new URL(page.url())
  // Proxy contract: a bare gate redirect would be /login with NO query.
  const isBareGateRedirect =
    url.pathname === '/login' && url.searchParams.get('error') === null
  expect(isBareGateRedirect).toBe(false)
  // Handler contract: token-less confirm → /login?error=confirm (handler ran).
  expect(url.searchParams.get('error')).toBe('confirm')
})

// ---------------------------------------------------------------------------
// Test B — /auth/callback: same shape as Test A. A code-less hit runs the
// handler's guard and redirects to /login?error=oauth (NOT a bare gate
// redirect). The `error=oauth` marker proves the handler ran.
// ---------------------------------------------------------------------------
test('signed-out user reaching /auth/callback is handled (not gated to bare /login)', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/auth/callback')
  const url = new URL(page.url())
  const isBareGateRedirect =
    url.pathname === '/login' && url.searchParams.get('error') === null
  expect(isBareGateRedirect).toBe(false)
  expect(url.searchParams.get('error')).toBe('oauth')
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

// Now GREEN (plan 06.1-04): verify-email/page.tsx reads ?email= instead of
// calling getCurrentUser(), so a signed-out visitor loads the page and stays on
// /verify-email, with the email rendered.
test('signed-out user can fully load /verify-email?email= (unblocked by plan 06.1-04)', async ({
  page,
  context,
}) => {
  await ensureSignedOut(page, context)
  await page.goto('/verify-email?email=x@y.test')
  await expect(page).toHaveURL(/\/verify-email/)
  expect(page.url()).not.toContain('/login')
  // The page must show the email it was handed in the URL.
  await expect(page.getByText('x@y.test')).toBeVisible()
})

// Still owned by a follow-up: asserting signup → /verify-email?email= requires
// submitting the real signup form, which writes to Supabase and sends a Resend
// email — neither is available in this E2E env (no cloud creds/SMTP). The
// server-side redirect is already in place (actions.ts signUp). Left as fixme so
// the suite stays green; gap documented in 06.1-04-SUMMARY.md.
test.fixme('signup → lands on /verify-email?email= (needs live Supabase + Resend)', async () => {
  // Submitting the signup form with confirmation ON returns no session and
  // redirects to /verify-email?email=<encoded>. Requires a configured cloud
  // Supabase project + Resend SMTP to exercise end-to-end.
})

// Now GREEN (plan 06.1-04): clicking Resend swaps the link for a disabled
// "Sent — you can resend in Ns" cooldown state (~45s).
test('resend button disables for cooldown (plan 06.1-04)', async ({ page, context }) => {
  await ensureSignedOut(page, context)
  await page.goto('/verify-email?email=x@y.test')
  const resend = page.getByRole('button', { name: 'Resend email' })
  await expect(resend).toBeVisible()
  await resend.click()
  // The button is gone, replaced by the cooling-down text; the live button is no
  // longer clickable during the window.
  await expect(page.getByRole('button', { name: 'Resend email' })).toHaveCount(0)
  await expect(page.getByText(/you can resend in \d+s/)).toBeVisible()
})
