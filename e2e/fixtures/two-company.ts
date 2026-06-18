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
import { execFileSync } from 'node:child_process'

/** The two seeded counterparties — Alice (GreenLeaf) and Bob (StonePharm). */
export type Who = 'alice' | 'bob'

/** The local Supabase Postgres (see CLAUDE.md / playwright notes). */
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// The GreenLeaf <-> StonePharm relationship id is NOT hardcoded: the seed
// regenerates it (gen_random_uuid) on every `supabase db reset`, so a frozen id
// goes stale and resetDealData would clean the wrong relationship. It is resolved
// at runtime by company name inside resetDealData (below).

/**
 * Reset the GreenLeaf <-> StonePharm relationship to the clean "State A"
 * (no deal, no proposal) the held-change tests assume at start.
 *
 * WHY a targeted truncate, not `supabase db reset`: each test mints + mutates the
 * ONE shared card on this relationship, so tests collide unless the deal data is
 * wiped between them. A full `supabase db reset` would tear down the running dev
 * server's schema/seed (slow + risks a broken next test); this scoped delete
 * removes only this relationship's deal cards + proposal messages, leaving every
 * other seed row (logins, ordinary chat history, the other relationship) intact.
 *
 * The delete order respects the FK graph:
 *   - the deal_card <-> chat_thread loop is broken from the CARD side
 *     (deal_card.thread_id is nullable; a 'deal' thread may NOT have a null
 *     deal_card_id, per the chat_thread_deal_has_card CHECK);
 *   - deal_change_input is removed before deal_card_log (it FK's the log);
 *   - workspace + line-item children are removed before their parents.
 *
 * Runs straight against the local Postgres via psql (no `pg` dep in the repo).
 */
const RESET_SQL = `
BEGIN;
CREATE TEMP TABLE _cards ON COMMIT DROP AS
  SELECT id FROM deal_card WHERE relationship_id = :'rel';
CREATE TEMP TABLE _ws ON COMMIT DROP AS
  SELECT id FROM deal_workspace WHERE deal_card_id IN (SELECT id FROM _cards);
CREATE TEMP TABLE _lines ON COMMIT DROP AS
  SELECT id FROM deal_line_item WHERE deal_card_id IN (SELECT id FROM _cards);
CREATE TEMP TABLE _dthreads ON COMMIT DROP AS
  SELECT id FROM chat_thread WHERE deal_card_id IN (SELECT id FROM _cards);
UPDATE deal_card SET thread_id = NULL WHERE id IN (SELECT id FROM _cards);
DELETE FROM chat_message    WHERE thread_id IN (SELECT id FROM _dthreads);
DELETE FROM sella_detection WHERE thread_id IN (SELECT id FROM _dthreads);
DELETE FROM chat_thread     WHERE id IN (SELECT id FROM _dthreads);
DELETE FROM deal_artifact WHERE deal_workspace_id IN (SELECT id FROM _ws);
DELETE FROM deal_member   WHERE deal_workspace_id IN (SELECT id FROM _ws);
DELETE FROM thing         WHERE deal_workspace_id IN (SELECT id FROM _ws);
DELETE FROM deal_line_item_private WHERE deal_line_item_id IN (SELECT id FROM _lines);
DELETE FROM deal_change_input   WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_card_log       WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_confirmation   WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_line_item      WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_party_field    WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_pending_change WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_workspace      WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM pending_inbox_item  WHERE deal_card_id IN (SELECT id FROM _cards);
DELETE FROM deal_card WHERE id IN (SELECT id FROM _cards);
-- Phase 2 (announcements): the deal thread is re-minted each test (it self-cleans
-- above with the card), but the p2p thread PERSISTS across serial tests. So a prior
-- test's accept/decline announcement (sender='sella', type 'deal_card_updated' /
-- 'deal_change_declined') would otherwise leak into the next test's p2p chat and make
-- a getByText assertion match the stale bubble. Widen this delete to clear all three
-- projection types from the relationship's p2p thread (RESEARCH Pitfall 4).
DELETE FROM chat_message
  WHERE type IN ('deal_detected', 'deal_card_updated', 'deal_change_declined')
  AND thread_id IN (SELECT id FROM chat_thread WHERE relationship_id = :'rel');
DELETE FROM sella_detection
  WHERE thread_id IN (SELECT id FROM chat_thread WHERE relationship_id = :'rel');
COMMIT;
`

/** Locate a usable psql binary (PATH first, then the macOS Postgres.app path). */
function psqlBin(): string {
  const candidates = ['psql', '/Applications/Postgres.app/Contents/Versions/latest/bin/psql']
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' })
      return bin
    } catch {
      // try the next candidate
    }
  }
  throw new Error('psql not found on PATH or in Postgres.app — cannot reset deal data')
}

/**
 * Wipe this relationship's deal cards + proposal messages so the next test starts
 * from the clean "Start a deal" state. Synchronous (psql via stdin) so it finishes
 * before the browser contexts open in beforeEach. ON_ERROR_STOP makes a bad
 * delete fail loud instead of leaving half-clean state.
 */
export function resetDealData(): void {
  const bin = psqlBin()
  // Resolve the GreenLeaf <-> StonePharm relationship id at RUNTIME — the seed
  // regenerates it on every `supabase db reset`, so a hardcoded id goes stale and
  // would silently clean the wrong relationship (leaving the seed proposal, so the
  // chat is never in the "Start a deal" State A the tests need).
  const rel = resolveRelationshipId(bin)
  execFileSync(bin, [DB_URL, '-v', `rel=${rel}`, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], {
    input: RESET_SQL,
    stdio: ['pipe', 'ignore', 'pipe'],
  })
}

/**
 * The SQL that resolves the GreenLeaf <-> StonePharm relationship id by company
 * NAME (never a hardcoded uuid — the seed regenerates ids on every
 * `supabase db reset`). Shared by resetDealData and countRelationshipMessages.
 */
const RELATIONSHIP_BY_NAME_SQL =
  'select r.id from public.relationship r ' +
  'join public.company ca on ca.id = r.company_a_id ' +
  'join public.company cb on cb.id = r.company_b_id ' +
  "where (ca.name like 'GreenLeaf%' and cb.name like 'StonePharm%') " +
  "or (ca.name like 'StonePharm%' and cb.name like 'GreenLeaf%') limit 1"

/** Resolve the GreenLeaf <-> StonePharm relationship id at RUNTIME (by name). */
function resolveRelationshipId(bin: string): string {
  const rel = execFileSync(bin, [DB_URL, '-At', '-c', RELATIONSHIP_BY_NAME_SQL], {
    encoding: 'utf8',
  }).trim()
  if (!rel) throw new Error('GreenLeaf <-> StonePharm relationship not found')
  return rel
}

/**
 * Count the live `chat_message` rows across ALL of the GreenLeaf <-> StonePharm
 * relationship's threads (the deal thread + the p2p thread). Used by the
 * `withdraw-silent` test (ANNC-03): silence is hard to prove in the UI, so we
 * snapshot the count BEFORE the withdraw, run the withdraw, and assert the count
 * is UNCHANGED — i.e. the withdraw announced NOTHING.
 *
 * The relationship id is resolved at RUNTIME by company name (never hardcoded),
 * exactly as resetDealData does — the seed regenerates ids on every db reset.
 * Counts only non-deleted rows (deleted_at is null), since announcements are
 * hard inserts that never soft-delete.
 */
export function countRelationshipMessages(): number {
  const bin = psqlBin()
  const rel = resolveRelationshipId(bin)
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.chat_message m ` +
        `join public.chat_thread t on t.id = m.thread_id ` +
        `where t.relationship_id = '${rel}' and m.deleted_at is null`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Resolve the GreenLeaf <-> StonePharm relationship's CURRENT deal card id at
 * RUNTIME (never hardcoded — the seed regenerates ids on every
 * `supabase db reset`, and the card itself is minted fresh per test by
 * `birthAndOpenDeal`). `resetDealData` truncates every prior card on this
 * relationship, so after a birth exactly one card exists — `limit 1` is safe.
 *
 * Needed by the "note-not-in-log" test (D-05): it must pass a real card id to
 * `countDealChangeInputForCard`, and the card overlay exposes no id in the DOM
 * or URL (it opens as an in-page overlay, not a routed page).
 */
export function resolveDealCardIdForRelationship(): string {
  const bin = psqlBin()
  const rel = resolveRelationshipId(bin)
  const id = execFileSync(
    bin,
    [DB_URL, '-At', '-c', `select id from public.deal_card where relationship_id = '${rel}' limit 1`],
    { encoding: 'utf8' },
  ).trim()
  if (!id) throw new Error('no deal_card found for the GreenLeaf <-> StonePharm relationship')
  return id
}

/**
 * Count the live `deal_change_input` rows for ONE deal card (NOTE-01 / D-05).
 * The create-time note must NEVER add a log row — only a held CHANGE (the
 * Accept/Decline reason gate) writes `deal_change_input`. The card id is
 * passed in by the caller, resolved at RUNTIME from the freshly-born card
 * (NEVER hardcoded — the seed regenerates ids on every `supabase db reset`).
 *
 * Mirrors countRelationshipMessages's shape exactly: psqlBin() + execFileSync
 * + `-At -c` + `.trim()` + `Number(out)`. `deal_change_input` is already a
 * child of `deal_card`, so resetDealData's existing truncate covers it — no
 * new reset row needed here.
 */
export function countDealChangeInputForCard(dealCardId: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.deal_change_input where deal_card_id = '${dealCardId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

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
  opts?: { note?: string },
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
  // 3c (NOTE-01 D-08): optionally seed the create-time note — CreateDealForm's
  // note textarea is optional at draft (noteRequired=false), placeholder "Add a
  // note for your contact…" (DealForm.tsx:330-332).
  if (opts?.note) {
    await alicePage.getByPlaceholder(/add a note for your contact/i).fill(opts.note)
  }
  await alicePage.getByRole('button', { name: /send proposal/i }).click()

  // try to read the born card id from the deal route, if the app navigates there.
  const match = alicePage.url().match(/\/deal\/([0-9a-f-]{36})/)
  return { dealCardId: match ? match[1] : null }
}

/**
 * Bob accepts Alice's birth proposal. `proposeDeal` only writes a PROPOSAL — the
 * card is born when the OTHER side accepts (confirm_detected_deal). Bob opens the
 * GreenLeaf chat, clicks the "Review" pill, then "Accept" inside the popover.
 */
export async function acceptBirthAsBob(bobPage: Page): Promise<void> {
  await bobPage.goto('/connect/chat')
  await bobPage.getByText(COUNTERPARTY_NAME.bob, { exact: false }).first().click()
  await bobPage.getByRole('button', { name: /review/i }).first().click()
  await bobPage.getByRole('button', { name: /^accept/i }).first().click()
}

/**
 * Open the deal in `who`'s counterparty chat and open the card overlay so the
 * Edit pencil + card content are visible. Waiting for the "Open card" affordance
 * doubles as the "card has been born" sync point.
 */
export async function openDealInChat(page: Page, who: Who): Promise<void> {
  await page.goto('/connect/chat')
  await page.getByText(COUNTERPARTY_NAME[who], { exact: false }).first().click()
  const openCard = page.getByRole('button', { name: /open card/i })
  await openCard.first().waitFor({ timeout: 15000 })
  await openCard.first().click()
}

/**
 * Re-read the deal on `who`'s screen from the server: reload the page, re-open the
 * counterparty chat, and re-open the card overlay. The strip then reflects the
 * CURRENT server state (the held change appeared / cleared, the lock flipped).
 *
 * WHY this is needed (KNOWN APP BUG, see the spec header): DealPin.tsx subscribes
 * to postgres_changes on `deal_pending_change`, but that table was never added to
 * the `supabase_realtime` publication (only chat_message + chat_thread are — see
 * supabase/migrations/20260616120000_deal_pending_change.sql, which omits the
 * `alter publication supabase_realtime add table deal_pending_change`). So the
 * pencil-lock / "Review change" pill DOES NOT update live on the OTHER side — the
 * user must refresh. This helper performs exactly that refresh, so the tests can
 * still verify the real success criteria (both sides locked, the reason gate, the
 * two-sided commit) on the correct server state without depending on the broken
 * live transport. It does NOT weaken any assertion — it only re-reads the state
 * the missing realtime event would have delivered.
 */
export async function refreshDealView(page: Page, who: Who): Promise<void> {
  await openDealInChat(page, who)
}

/**
 * Full two-sided setup the held-change tests need: Alice proposes, Bob accepts
 * (births the draft card), then BOTH sides open the card overlay. After this each
 * page shows the live draft card with the Edit pencil reachable.
 */
export async function birthAndOpenDeal(
  alicePage: Page,
  bobPage: Page,
  opts?: { note?: string },
): Promise<void> {
  await createDraftDealAsAlice(alicePage, opts)
  await acceptBirthAsBob(bobPage)
  await openDealInChat(alicePage, 'alice')
  await openDealInChat(bobPage, 'bob')
}
