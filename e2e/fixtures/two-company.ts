/**
 * Two-company test fixture for the held-deal-change flow (Phase 1).
 *
 * SETUP ONLY — this module makes NO behavioral assertions. It gives the
 * deal-change spec three things it needs:
 *
 *   1. `loginAs(page, who)`        — sign one page in as Alice or Bob.
 *   2. `openTwoContexts(browser)`  — two independent browser contexts so Alice
 *                                    and Bob hold separate sessions (required to
 *                                    test the two-sided accept / decline gate).
 *   3. `createDraftDealAsAlice(p)` — drive the in-app deal-create flow to get a
 *                                    live draft card both sides can act on
 *                                    (the LOCAL DB has no seeded cloud card, so
 *                                    every test mints its own).
 *
 * Selectors mirror `e2e/smoke.spec.ts` (the only existing e2e) and the real
 * components read this session:
 *   - login form (src/app/(auth)/login/page.tsx + AuthCard.tsx):
 *       input[name="email"], input[name="password"], a "Sign in" submit button.
 *   - the deal create flow (DealPin.tsx "Start a deal" → CreateDealForm →
 *       DealForm "Send proposal").
 *
 * Resilient by design: we prefer getByRole + name regexes over brittle class
 * selectors, because the held-change UI does not exist yet — these helpers are
 * the stable contract plans 02-04 build the app up to meet.
 *
 * Local stack: app on http://localhost:3000 (Playwright baseURL), Supabase on
 * 127.0.0.1:54321. Seeded logins: alice@greenleaf.test / bob@stonepharm.test,
 * password `password123`.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test'

/** The two seeded counterparties — Alice (GreenLeaf) and Bob (StonePharm). */
export type Who = 'alice' | 'bob'

const CREDENTIALS: Record<Who, { email: string; password: string }> = {
  alice: { email: 'alice@greenleaf.test', password: 'password123' },
  bob: { email: 'bob@stonepharm.test', password: 'password123' },
}

/** The other company's display name — used to find the right chat thread. */
export const COUNTERPARTY_NAME: Record<Who, string> = {
  alice: 'StonePharm',
  bob: 'GreenLeaf',
}

/**
 * Sign `page` in as Alice or Bob. Mirrors the login-assert seam in
 * e2e/smoke.spec.ts: navigate to /login, fill the email + password fields, then
 * submit the "Sign in" button and wait for the app to leave the login route.
 */
export async function loginAs(page: Page, who: Who): Promise<void> {
  const { email, password } = CREDENTIALS[who]
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // the app redirects off /login once the session is set; wait for that.
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

/**
 * Open two independent browser contexts and return a logged-in page for each
 * side. Separate contexts (not just two tabs) are required so Alice's and Bob's
 * Supabase sessions never share cookies — the two-sided accept / decline gate
 * only makes sense when each side acts as itself.
 */
export async function openTwoContexts(
  browser: Browser,
): Promise<{
  aliceContext: BrowserContext
  bobContext: BrowserContext
  alicePage: Page
  bobPage: Page
}> {
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alicePage = await aliceContext.newPage()
  const bobPage = await bobContext.newPage()
  await loginAs(alicePage, 'alice')
  await loginAs(bobPage, 'bob')
  return { aliceContext, bobContext, alicePage, bobPage }
}

/**
 * Drive the in-app deal-create flow as Alice to mint a fresh DRAFT deal card
 * with StonePharm, then have Bob accept the birth proposal so a live card
 * exists for both sides. Returns the deal card's id when it can be read from the
 * URL, else null (the caller can still act through the strip).
 *
 * Flow (best-effort, resilient selectors):
 *   1. open the Connect chat with StonePharm (the p2p thread that can host a
 *      proposal — DealPin only proposes over a real p2p thread).
 *   2. press "Start a deal" (DealPin State A) to open CreateDealForm.
 *   3. add a product line, set a quantity + unit price, Send the proposal.
 *
 * The acceptance + birth (Bob's side) is left to the spec, because each test
 * needs the proposal in a specific pre- or post-birth state.
 *
 * NOTE: this is setup scaffolding for a flow that is not fully built for held
 * CHANGES yet. It deliberately makes no assertions; if a step's selector is not
 * present, the helper surfaces the failure to the calling test (which is
 * expected to be RED until plans 02-04 land the held-change UI).
 */
export async function createDraftDealAsAlice(
  alicePage: Page,
): Promise<{ dealCardId: string | null }> {
  // 1. land in Connect and open the StonePharm conversation.
  await alicePage.goto('/connect/chat')
  await alicePage
    .getByText(COUNTERPARTY_NAME.alice, { exact: false })
    .first()
    .click()

  // 2. open the create-deal form from the strip's "Start a deal" affordance.
  //    `exact` so we hit the strip button, not the "Coming soon" home-card that
  //    also contains the words "Start a deal" (strict-mode would match both).
  await alicePage.getByRole('button', { name: 'Start a deal', exact: true }).click()

  // 3. add a product, set quantity + unit price, then send the proposal.
  //    The catalogue grid loads async under the "Top products" heading; wait for
  //    the heading, then click the first enabled product card. Resilient to the
  //    seeded product names (we never match a specific name).
  await alicePage.getByText('Top products').waitFor()
  await alicePage
    .getByRole('button')
    .filter({ hasText: /\/g$|no price/ })
    .first()
    .click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('100')
  await alicePage.getByPlaceholder(/g \(optional\)/i).first().fill('5.00')
  await alicePage.getByRole('button', { name: /send proposal/i }).click()

  // try to read the born card id from the deal route, if the app navigates there.
  const match = alicePage.url().match(/\/deal\/([0-9a-f-]{36})/)
  return { dealCardId: match ? match[1] : null }
}
