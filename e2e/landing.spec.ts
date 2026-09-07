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

// ---------------------------------------------------------------------------
// Case 13 — M1 (0028/T01): the hero renders exactly one <h1> element, whose
// text is the new headline. An explicit count() === 1 is asserted rather than
// leaning on Playwright's strict-mode side effect on an unscoped locator —
// M1's contract is the count itself, not a byproduct of assertion resolution.
// Uses page.locator('h1') rather than getByRole('heading', { level: 1 }): the
// role locator also matches any role="heading" aria-level="1", a different
// (looser) contract than "exactly one <h1> element".
// RED: Hero.tsx:30 still renders "AI FOR DEALMAKERS" (0028/T01 not built).
// ---------------------------------------------------------------------------
test('h1 count and text: exactly one <h1>, reading the new headline', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/')
  const h1 = page.locator('h1')
  expect(await h1.count()).toBe(1)
  await expect(h1).toHaveText('ONE SECURE SPACE FOR EVERY B2B DEAL')
})

// ---------------------------------------------------------------------------
// Case 14 — M2 (0028/T01): the first <p> following the <h1> in document
// order carries the D5-approved subtitle, exactly. NOT a CSS sibling
// assertion — `h1 + p` and `h1 ~ p` both match nothing here, because the
// <h1> sits inside its own <Reveal delayMs={60}> and the subhead sits inside
// a SEPARATE <Reveal delayMs={120}> (Hero.tsx:27-41), so a wrapper <div>
// interposes on each. Walks document.querySelectorAll('h1, p') in document
// order (the spec order the selector list is returned in) and takes the
// first <p> positioned after the <h1>. Whitespace is normalised (JSX
// collapses the multi-line literal to single spaces) but punctuation is NOT
// normalised — the em dash (U+2014) after "deals" is the assertion, not a
// hyphen.
// RED: Hero.tsx:37-39 still renders the retired "Discover verified
// partners…" subhead (0028/T01 not built).
// ---------------------------------------------------------------------------
test('subhead document order: first <p> after <h1> is the D5 subtitle', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/')
  const rawText = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    if (!h1) return null
    const nodes = Array.from(document.querySelectorAll('h1, p'))
    const h1Index = nodes.indexOf(h1)
    const nextP = nodes.slice(h1Index + 1).find((el) => el.tagName === 'P')
    return nextP ? nextP.textContent : null
  })
  const normalised = (rawText ?? '').replace(/\s+/g, ' ').trim()
  expect(normalised).toBe(
    'Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI platform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.',
  )
})

// ---------------------------------------------------------------------------
// Case 15 — M3 (0028/T01): inside #what-you-can-do, the <h2> reads "What you
// can do on Hello Sello", the section renders exactly 3 capability cards
// (<h3>), and their titles name creating offers/orders, sending to
// customers/suppliers, and verified partners. Scoped to the section id
// rather than an unscoped getByText('What you can do') — the eyebrow <p>
// and the <h2> both contain that substring, which is a strict-mode
// violation.
// RED: ValueProps.tsx has no id="what-you-can-do" section and ships 4 cards
// under a different ("Built for safe B2B trade") heading (0028/T01 not built).
// ---------------------------------------------------------------------------
test('what you can do: heading + exactly 3 capability cards', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  const section = page.locator('#what-you-can-do')
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(
    'What you can do on Hello Sello',
  )
  const cards = section.locator('h3')
  expect(await cards.count()).toBe(3)
  const titles = await cards.allTextContents()

  // M3's naming clause is about CAPABILITY framing — PRD AC 3 recasts §4 away
  // from benefit framing — so each VERB is part of the contract, not decoration.
  // Asserting the noun phrases alone was too weak: a benefit-framed "Track
  // offers and orders" or "Hidden from customers and suppliers" would pass it
  // while falsifying M3. The verbs are matched loosely (`creat\w*`, `send\w*`)
  // so ordinary copy edits stay free, but the framing cannot silently revert.
  //
  // Each pattern must match EXACTLY ONE title, not merely "some" title: three
  // independent .some() calls do not bind a phrase to a distinct card, so one
  // compound title carrying two phrases plus a duplicate would satisfy all
  // three. (`verified partners` carries no verb — M3 names it as a noun.)
  const CAPABILITIES = [
    /creat\w*\s+offers and orders/i,
    /send\w*\s+to\b.*\bcustomers and suppliers/i,
    /verified partners/i,
  ]
  for (const capability of CAPABILITIES) {
    expect(
      titles.filter((t) => capability.test(t)),
      `exactly one §4 card title should match ${capability}`,
    ).toHaveLength(1)
  }
})

// ---------------------------------------------------------------------------
// Case 16 — M10 (0028/T01): <meta name="description"> equals T01's rewritten
// string exactly, and contains NEITHER of the two retired card-title phrases
// ("no cross-company leaks", "documented deals") the old description
// paraphrased. Equality, not toContain — page.tsx's description is a plain
// TS string literal (no JSX whitespace-collapse to rescue a join slip), so
// only exact-match catches a lost or doubled space at the concatenation seam.
// RED: page.tsx:26 still ships the old "B2B marketplace… no cross-company
// leaks… documented deals" description (0028/T01 not built).
// ---------------------------------------------------------------------------
test('meta description rewritten: equals T01 string, no retired phrases', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/')
  const content = await page.locator('meta[name="description"]').getAttribute('content')
  expect(content).toBe(
    'One secure space for every B2B deal. Verified buyers and sellers create offers and orders, send them to every partner, and trade in encrypted chat hosted in Germany.',
  )
  expect(content).not.toContain('no cross-company leaks')
  expect(content).not.toContain('documented deals')
})
