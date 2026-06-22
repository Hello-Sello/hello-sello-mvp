/**
 * Phase 9 — Public Landing & Legal Pages E2E spec (09-01 Wave-0 RED scaffold)
 *
 * This is the single source of truth for "is Phase 9 done". Every case below is
 * RED right now — the public landing (`/`), the German legal pages
 * (`/impressum`, `/datenschutz`, `/agb`), and the cookie-consent banner do not
 * exist yet. Today a logged-out hit to `/` redirects to `/login` (the proxy
 * gate), so the routes 307/redirect instead of rendering a 200 landing.
 *
 * Each later wave turns one or more of these cases GREEN:
 *   - 09-02: landing route + sections + proxy allowlist + signed-in redirect
 *   - 09-03: cookie-consent banner (Accept/Reject parity + persistence + reopen)
 *   - 09-04: German legal pages (Impressum §5 DDG, Datenschutz, AGB §§305-310 BGB)
 *
 * One named, grep-able test case per 09-VALIDATION.md row (the title contains the
 * `-g "..."` tag substring so `-g "logged-out lands"` selects exactly one case).
 *
 * These are STATELESS public-route assertions — no DB mutation — so there is no
 * `test.describe.configure({ mode: 'serial' })`. Only one case signs in
 * (`signed-in redirected`), reusing the seeded alice@greenleaf.test fixture via
 * the `signIn` helper copied verbatim from e2e/auth-gate.spec.ts.
 *
 * Requirements covered: LAND-01, LAND-02, LAND-03, LAND-04 (+ D-11, D-12).
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// Seeded signed-in fixture (company is verified after the standard seed) — used
// only by the "signed-in redirected" case. Matches public-profile.spec.ts.
const ALICE_EMAIL = 'alice@greenleaf.test'
const ALICE_PASSWORD = 'password123'

// ---------------------------------------------------------------------------
// Shared sign-in helper — copied verbatim from e2e/auth-gate.spec.ts.
// ---------------------------------------------------------------------------
async function signIn(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  await context.clearCookies()
  await page.goto('/login')
  await page.evaluate(() => {
    try {
      window.localStorage.clear()
    } catch (_) {
      /* noop */
    }
  })
  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Case 1 — LAND-01: logged-out GET / returns the landing (200, hero <h1>),
// NOT a 307 redirect to /login.
// RED: src/app/page.tsx still does redirect("/connect") and the proxy gate
// bounces logged-out hits to /login (09-02 adds the landing + allowlist).
// ---------------------------------------------------------------------------
test('logged-out lands: GET / returns the landing (200, hero h1, no /login redirect)', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(page.url()).toMatch(/\/$/)
  expect(page.url()).not.toContain('/login')
})

// ---------------------------------------------------------------------------
// Case 2 — LAND-01: signed-in GET / redirects into the app (URL → /home).
// RED: the landing + signed-in redirect-to-app branch is not built (09-02).
// ---------------------------------------------------------------------------
test('signed-in redirected: GET / sends a signed-in user into the app (/home)', async ({
  page,
  context,
}) => {
  await signIn(page, context, ALICE_EMAIL, ALICE_PASSWORD)
  await page.goto('/')
  await page.waitForURL((url) => url.pathname === '/home', { timeout: 10_000 })
  expect(page.url()).toContain('/home')
  expect(new URL(page.url()).pathname).not.toBe('/')
})

// ---------------------------------------------------------------------------
// Case 3 — LAND-01: the public landing renders NO app chrome (no TopBar).
// The signed-in TopBar renders <header className="glass-strong …">; a public
// page must have zero such elements. (Do NOT assert on a generic <nav> — the
// landing's own LandingNav/Footer are <nav>, so that selector is ambiguous.)
// RED: today logged-out `/` bounces to /login (no landing renders at all).
// ---------------------------------------------------------------------------
test('no app chrome: logged-out / renders zero header.glass-strong (no TopBar)', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/')
  expect(await page.locator('header.glass-strong').count()).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 4 — LAND-01 / LAND-03: footer legal links resolve (each 200, ≤2 clicks).
// RED: /impressum, /datenschutz, /agb routes + proxy allowlist not built (09-04).
// ---------------------------------------------------------------------------
test('legal links resolve: /impressum, /datenschutz, /agb each return 200', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  for (const path of ['/impressum', '/datenschutz', '/agb']) {
    const res = await page.goto(path)
    // 200 alone is not enough: today the proxy bounces a logged-out hit on an
    // unknown route to /login, which itself returns 200 (page.goto follows the
    // redirect). Assert we actually LANDED on the legal path — not bounced to
    // /login — so the case is RED until 09-04 adds the routes + proxy allowlist.
    expect(res?.status(), `${path} should return 200`).toBe(200)
    expect(new URL(page.url()).pathname, `${path} must not bounce to /login`).toBe(path)
  }
})

// ---------------------------------------------------------------------------
// Case 5 — LAND-02: the rendered landing contains the B2B-only statement.
// RED: landing not built; the "nicht an Verbraucher" copy does not render (09-02).
// ---------------------------------------------------------------------------
test('B2B only string: landing shows "nicht an Verbraucher"', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  // The substring renders in BOTH the dedicated B2B band (§8) and the footer
  // line (§11) — LAND-02 mandates the verbatim phrase in both (09-02 plan:
  // must_haves + B2BOnlyBand/Footer artifacts). getByText is a substring match,
  // so it resolves to two elements; assert the first is visible (presence is the
  // contract — dual placement is by design, not a regression).
  await expect(page.getByText('nicht an Verbraucher').first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Case 6 — LAND-03: first-visit cookie banner shows BOTH Accept and Reject.
// RED: the consent banner is not built (09-03).
// ---------------------------------------------------------------------------
test('cookie banner first visit: Accept and Reject are both visible', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  await expect(page.getByRole('button', { name: /accept/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Case 7 — LAND-03: Accept and Reject have equal prominence — same element
// type (both <button>) and the same size/padding class tokens. (Reject-parity
// is the #1 Abmahnung trigger — D-12.)
// RED: the consent banner is not built (09-03).
// ---------------------------------------------------------------------------
test('cookie buttons equal: Accept and Reject share element type and size class', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/')

  const accept = page.getByRole('button', { name: /accept/i })
  const reject = page.getByRole('button', { name: /reject/i })
  await expect(accept).toBeVisible()
  await expect(reject).toBeVisible()

  // Both must be real <button> elements (not one <a> styled as a link).
  const acceptTag = await accept.evaluate((el) => el.tagName.toLowerCase())
  const rejectTag = await reject.evaluate((el) => el.tagName.toLowerCase())
  expect(acceptTag).toBe('button')
  expect(rejectTag).toBe('button')

  // Both must share the same padding + text-size class tokens (equal prominence).
  const sizeTokens = (cls: string | null) =>
    (cls ?? '')
      .split(/\s+/)
      .filter((t) => /^(p|px|py|text)-/.test(t))
      .sort()
  const acceptTokens = sizeTokens(await accept.getAttribute('class'))
  const rejectTokens = sizeTokens(await reject.getAttribute('class'))
  expect(acceptTokens).toEqual(rejectTokens)
})

// ---------------------------------------------------------------------------
// Case 8 — LAND-03: after a choice, the banner does not reappear on reload.
// RED: consent persistence not built (09-03).
// ---------------------------------------------------------------------------
test('consent persists: after Reject + reload the banner is gone', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  await page.getByRole('button', { name: /reject/i }).click()
  await page.goto('/')
  expect(await page.getByRole('button', { name: /reject/i }).count()).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 9 — LAND-03: the footer "Cookie settings" link re-opens the banner.
// RED: footer reopen control + banner not built (09-03).
// ---------------------------------------------------------------------------
test('cookie reopen: footer "Cookie settings" re-opens the banner', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  // Make a choice so the banner is dismissed/persisted first.
  await page.getByRole('button', { name: /reject/i }).click()
  // Re-open via the footer control.
  await page.getByRole('button', { name: /cookie settings/i }).click()
  await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Case 10 — D-12: Impressum must cite § 5 DDG (law changed 14 May 2024) and
// must NOT contain the superseded TMG reference.
// RED: /impressum not built (09-04).
// ---------------------------------------------------------------------------
test('impressum cites DDG not TMG: contains "§ 5 DDG", no "TMG"', async ({ page }) => {
  await page.goto('/impressum')
  await expect(page.getByText('§ 5 DDG')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain('TMG')
})

// ---------------------------------------------------------------------------
// Case 11 — LAND-04 / D-11: each legal page shows the German "pending legal
// review" placeholder notice (wording is NOT invented — D-11).
// RED: legal pages + notice not built (09-04).
// ---------------------------------------------------------------------------
test('pending review notice: each legal page shows "rechtlich noch nicht geprüft"', async ({
  page,
}) => {
  for (const path of ['/impressum', '/datenschutz', '/agb']) {
    await page.goto(path)
    await expect(
      page.getByText('rechtlich noch nicht geprüft'),
      `${path} should show the pending-review notice`,
    ).toBeVisible()
  }
})

// ---------------------------------------------------------------------------
// Case 12 — LAND-04 / D-12: /agb is framed as German GTC (§§305-310 BGB), NOT
// a US-style "Terms of Service". (Mirrors the §10 DDG/TMG guard in case 10.)
// RED: /agb not built (09-04).
// ---------------------------------------------------------------------------
test('agb is german gtc: contains BGB / §§ 305, not "Terms of Service"', async ({ page }) => {
  await page.goto('/agb')
  const body = await page.locator('body').innerText()
  expect(body).toMatch(/BGB|§§\s*305/)
  expect(body).not.toContain('Terms of Service')
})
