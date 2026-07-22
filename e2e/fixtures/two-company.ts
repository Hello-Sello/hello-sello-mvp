/**
 * Two-company test fixture for the held-deal-change flow.
 *
 * SETUP ONLY — this module makes NO behavioral assertions. It gives the
 * deal-change / chat-phase7 specs three things they need:
 *
 *   1. `loginAs(page, who)`        — sign one page in as Alice or Bob.
 *   2. `openTwoContexts(browser)`  — two independent browser contexts so Alice
 *                                    and Bob hold separate sessions (required to
 *                                    test the two-sided sign / negotiate gate).
 *   3. `createDraftDealAsAlice(p)` — drive the in-app deal-CREATE flow to birth a
 *                                    live draft card both sides can act on
 *                                    (the LOCAL DB has no seeded cloud card, so
 *                                    every test mints its own).
 *
 * THE CURRENT (chj/07-08 "living deal card") flow, driven here:
 *   DealPin.tsx's "Start a deal" button dispatches `hs:create-deal-card`, which
 *   `DealCardPanelHost` (src/app/connect/DealCardPanelHost.tsx) turns into an
 *   empty CREATE-mode card in the SAME 50/50 side panel a real card uses — the
 *   real `CardFront`/`DealCard` component, permanently in edit mode, seeded via
 *   `emptyDraftView(buyerName)`. There is no more modal, no product search box,
 *   no "Send proposal" chat message, and no accept step for the other side:
 *   pressing "Send deal" calls `createDeal(...)` directly and the card is REAL
 *   the instant that resolves (D-32: no navigation, the panel swaps in place).
 *   `acceptBirthAsBob` (the old propose->accept birth door) no longer exists —
 *   there is nothing left for the other side to accept.
 *
 * Selectors mirror the real components as read this session:
 *   - login form (src/app/(auth)/login/page.tsx + AuthCard.tsx):
 *       input[name="email"], input[name="password"], a "Sign in" submit button.
 *   - the deal card panel: `<aside aria-label="Deal card">` (dealPanel below),
 *     mounted once at the Connect layout root (DealCardPanelHost).
 *   - the create-mode card (CardFront.tsx): a `+ Add product from your shop…`
 *     `<select>` (seller-only, only rendered when the catalogue is non-empty),
 *     per-row Batch/Unit-size `<select>`s (MOCK options, no real batch data),
 *     a Price `<input type="number">`, a Note `<textarea>`, and a "Send deal"
 *     button (disabled until at least one product line exists).
 *
 * Local stack: app on http://localhost:3000 (Playwright baseURL), Supabase on
 * 127.0.0.1:54321. Seeded logins: alice@greenleaf.test / bob@stonepharm.test,
 * password `password123`. Alice's (GreenLeaf's) real catalogue always includes
 * "Pedanios 31/1 COS-CA" (supplier_product_code AUR-1A, seed.sql section 6) —
 * used here as the deterministic create-time product so downstream tests can
 * rely on a stable name/price/quantity.
 */
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
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
-- test's accept/decline announcement (sender='sella'/'system', type 'deal_card_updated' /
-- 'deal_change_declined') would otherwise leak into the next test's p2p chat and make
-- a getByText assertion match the stale bubble. Widen this delete to clear all three
-- projection types from the relationship's p2p thread.
DELETE FROM chat_message
  WHERE type IN ('deal_detected', 'deal_card_updated', 'deal_change_declined',
                 'deal_card', 'deal_cancelled', 'deal_signed')
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
 * Needed by the "note-not-in-log" test: it must pass a real card id to
 * `countDealChangeInputForCard`, and the card panel exposes no id in the DOM
 * or URL (D-32: it opens as an in-page 50/50 panel, never a routed page).
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
 * Count the live `deal_change_input` rows for ONE deal card (NOTE-01). The
 * create-time note must NEVER add a log row — only a held CHANGE (a negotiate /
 * sign resolution) writes `deal_change_input`. The card id is passed in by the
 * caller, resolved at RUNTIME from the freshly-born card (NEVER hardcoded — the
 * seed regenerates ids on every `supabase db reset`).
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

/**
 * Count the live `deal_member` rows across ONE card's workspace (A1). A deal
 * born from a c2c COMPANY chat has no counterparty person, so its creator must
 * be the SOLE owner — that absence is the company-target routing key the
 * delivery spine (deliver_deal) reads. Card id resolved at RUNTIME by the
 * caller (never hardcoded — the seed regenerates ids on every db reset).
 */
export function countDealMembersForCard(dealCardId: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.deal_member dm ` +
        `join public.deal_workspace dw on dw.id = dm.deal_workspace_id ` +
        `where dw.deal_card_id = '${dealCardId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Count the deal_card rows on the GreenLeaf <-> StonePharm relationship — the
 * second-deal tests assert a repeat create really births a NEW card (2 rows),
 * not an edit of the first. Resolved at RUNTIME like everything else here.
 */
export function countDealCardsForRelationship(): number {
  const bin = psqlBin()
  const rel = resolveRelationshipId(bin)
  const out = execFileSync(
    bin,
    [DB_URL, '-At', '-c', `select count(*) from public.deal_card where relationship_id = '${rel}'`],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Count the live pending_inbox_item rows for ONE card (Lane A routing). A
 * PERSON-target birth (counterparty co-owner set) must deliver as a chat
 * message, never as a company inbox ticket — this proves the ticket half
 * stayed silent. Card id resolved at RUNTIME by the caller.
 */
export function countTicketsForCard(dealCardId: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.pending_inbox_item ` +
        `where deal_card_id = '${dealCardId}' and deleted_at is null`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * The `note` field of a card's currently-HELD change draft, or null if none is
 * held. A held note is NOT rendered anywhere in the current UI while it is only
 * held (CardFront's read-mode Note block reseeds from the SERVER's still-
 * uncommitted `myNote`/`theirNote` the moment `data.pendingChange` changes —
 * confirmed empirically: a just-sent note does not appear on the sender's own
 * screen until the change actually commits). This is the honest, DB-level way
 * to prove a held change's note "held, not committed" — mirrors
 * countDealChangeInputForCard's shape exactly.
 */
export function pendingChangeNote(dealCardId: string): string | null {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select draft->>'note' from public.deal_pending_change where deal_card_id = '${dealCardId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return out || null
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
 * Supabase sessions never share cookies — the two-sided sign / negotiate gate
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
 * The deal card panel — `DealCardPanelHost` renders both the CREATE-mode card
 * and a real card inside this same `<aside aria-label="Deal card">`, mounted
 * once at the Connect layout root. Scoping locators to this element (instead of
 * the whole page) avoids collisions with unrelated `<select>`s / buttons
 * elsewhere in the app shell.
 */
export function dealPanel(page: Page): Locator {
  return page.locator('aside[aria-label="Deal card"]')
}

/**
 * The ONE product row currently open for edit inside the deal panel (CardFront.tsx).
 * An open row is the only `<tr>` carrying the "Done editing this line" checkmark
 * button, so that is the stable anchor — it works identically whether the row was
 * just added from the catalogue (auto-opens) or opened via its own "Edit this
 * line" pencil. Within an open row the `<select>`s are, in DOM/column order:
 * [0] product swap (seller + non-empty catalogue only), [1] batch (mock list),
 * [2] unit size / quantity (mock list) — see CardFront.tsx's product table.
 */
export function openRowLocator(page: Page): Locator {
  return dealPanel(page)
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: /done editing this line/i }) })
}

/**
 * Open an EXISTING line for edit (a no-op if a line is already open — e.g. right
 * after adding a fresh product, which auto-opens via CardFront's addFromCatalog).
 * Existing lines start collapsed in edit mode and need their own "Edit this line"
 * pencil clicked first.
 */
export async function openFirstLineForEdit(page: Page): Promise<void> {
  const editBtn = dealPanel(page).getByRole('button', { name: /edit this line/i }).first()
  if ((await editBtn.count()) > 0) await editBtn.click()
}

/**
 * Drive the NEW in-app deal-CREATE flow as Alice to mint a fresh, REAL DRAFT deal
 * card with StonePharm — direct birth, no proposal/accept (see the module header).
 *
 * Flow:
 *   1. open the Connect chat with StonePharm (the p2p thread DealPin proposes
 *      over).
 *   2. click "Start a deal" (DealPin's State-A door) — opens an empty CREATE-mode
 *      card in the 50/50 panel (`emptyDraftView`, permanently in edit mode).
 *   3. pick a real product from Alice's (GreenLeaf's) own catalogue via the
 *      "+ Add product from your shop…" select (seller-only, non-empty-catalogue
 *      gated) — this auto-opens the fresh line for edit.
 *   4. set a deterministic quantity (100g, one of the mock unit-size options) and
 *      price (5.00) on the open row so downstream tests have stable values to
 *      assert against.
 *   5. optionally seed the create-time note (CardFront's note textarea — no
 *      label, placeholder "A note the other side will see on your behalf…").
 *   6. click "Send deal" — calls `createDeal(...)` for real and swaps the panel
 *      to the born card in place (no navigation).
 *
 * Deterministic product: "Pedanios 31/1 COS-CA" (seed.sql section 6, GreenLeaf's
 * AUR-1A) — always present in Alice's catalogue on a fresh `supabase db reset`.
 */
export async function createDraftDealAsAlice(
  alicePage: Page,
  opts?: { note?: string },
): Promise<void> {
  // 1. land in Connect and open the StonePharm conversation.
  await alicePage.goto('/connect/chat')
  await alicePage
    .getByText(COUNTERPARTY_NAME.alice, { exact: false })
    .first()
    .click()

  // 2. open the create-mode card from the strip's "Start a deal" door. `exact` so
  //    we hit the strip button, not any other control that happens to contain the
  //    same words (strict-mode would match both).
  await alicePage.getByRole('button', { name: 'Start a deal', exact: true }).click()

  // 3. pick a real product from Alice's own catalogue. The select's only rendered
  //    while no line is open yet, so it is the single `<select>` in the panel at
  //    this point; `selectOption` fires a real change event, which CardFront's
  //    addFromCatalog turns into a fresh, auto-opened line.
  const addProductSelect = dealPanel(alicePage)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })

  // 4. the fresh line auto-opens (setEditRowKey in addFromCatalog) — set a
  //    deterministic quantity + price on it. Quantity is the row's 3rd select
  //    (product swap, batch, THEN unit size); price is the row's only number input.
  const row = openRowLocator(alicePage)
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('5.00')

  // 5. optionally seed the create-time note (no label — the placeholder is the
  //    only handle; same textarea drives both create and edit mode).
  if (opts?.note) {
    await dealPanel(alicePage)
      .getByPlaceholder(/a note the other side will see on your behalf/i)
      .fill(opts.note)
  }

  // 6. birth it for real. Wait for a signal UNIQUE to the BORN card: the
  //    "Edit deal" pencil (a fresh draft with no held change always has it).
  //    ⚠️ NOT "Talk about this deal" — the CREATE-mode card shows that pill
  //    too, so it can resolve while the birth roundtrip is still in flight;
  //    a caller that keeps driving the panel then races handleCreate's
  //    completion (which closes any create session and swaps the born card in).
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage).getByRole('button', { name: /edit deal/i }).waitFor({
    timeout: 15000,
  })
}

/**
 * Drive the c2c (COMPANY chat) deal-create flow as Alice (Lane A): open the
 * GreenLeaf<->StonePharm company channel (found by its fixed "Company chat
 * (C2C)" subtitle after narrowing the list by search — the p2p row subtitles
 * the company name instead), press its "Start a deal" door, and birth the same
 * deterministic Pedanios draft as createDraftDealAsAlice. No counterparty
 * person exists in a company chat, so the birth is COMPANY-target: deliver_deal
 * writes the claimable inbox ticket for StonePharm at birth.
 */
export async function createC2cDealAsAlice(alicePage: Page): Promise<void> {
  await alicePage.goto('/connect/chat')
  await alicePage.getByPlaceholder('Search conversations…').fill(COUNTERPARTY_NAME.alice)
  await alicePage.getByText('Company chat (C2C)', { exact: true }).first().click()
  await alicePage.getByRole('button', { name: 'Start a deal', exact: true }).click()
  const addProductSelect = dealPanel(alicePage)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row = openRowLocator(alicePage)
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('5.00')
  // wait on the BORN-card-only pencil, not "Talk about this deal" (the create
  // card shows that too — see createDraftDealAsAlice's note on the race)
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage)
    .getByRole('button', { name: /edit deal/i })
    .waitFor({ timeout: 15000 })
}

/**
 * Open the deal in `who`'s counterparty chat and open the card panel so the Edit
 * pencil / DecisionBar / card content are visible. Waiting for the card-open
 * affordance doubles as the "card has been born" sync point.
 *
 * D-32 (living deal card): the old standalone "Deal Card" toggle button is GONE —
 * the strip's top bar now shows a small icon button (aria-label "Open the deal
 * card", FileText icon) once a real deal exists on the relationship; clicking it
 * dispatches `hs:open-deal-card`, which the layout-level `DealCardPanelHost`
 * turns into the 50/50 side panel.
 */
export async function openDealInChat(page: Page, who: Who): Promise<void> {
  await page.goto('/connect/chat')
  await page.getByText(COUNTERPARTY_NAME[who], { exact: false }).first().click()
  const openCard = page.getByRole('button', { name: 'Open the deal card', exact: true })
  await openCard.first().waitFor({ timeout: 15000 })
  await openCard.first().click()
  // wait for the REAL card to render (not the "Loading deal card…" placeholder) —
  // "Talk about this deal" is CardFront's fixed toolbar pill, present in EVERY
  // card state/status, unlike the pencil (hidden while a change is pending) or
  // DecisionBar's content (varies by status) — the most stable "loaded" signal.
  await dealPanel(page).getByRole('button', { name: /talk about this deal/i }).waitFor({
    timeout: 15000,
  })
}

/**
 * Re-read the deal on `who`'s screen from the server: reload the page, re-open the
 * counterparty chat, and re-open the card panel. The strip then reflects the
 * CURRENT server state (the held change appeared / cleared, the lock flipped).
 *
 * WHY this is needed (KNOWN APP BUG, see the spec header): DealPin.tsx subscribes
 * to postgres_changes on `deal_pending_change`, but that table was never added to
 * the `supabase_realtime` publication (only chat_message + chat_thread are — see
 * supabase/migrations/20260616120000_deal_pending_change.sql, which omits the
 * `alter publication supabase_realtime add table deal_pending_change`). So the
 * pencil-lock / DecisionBar content DOES NOT update live on the OTHER side — the
 * user must refresh. This helper performs exactly that refresh, so the tests can
 * still verify the real success criteria (both sides locked, the two-sided sign /
 * negotiate resolution) on the correct server state without depending on the
 * broken live transport. It does NOT weaken any assertion — it only re-reads the
 * state the missing realtime event would have delivered.
 */
export async function refreshDealView(page: Page, who: Who): Promise<void> {
  await openDealInChat(page, who)
}

/**
 * Full two-sided setup the negotiate/sign tests need: Alice creates + births a
 * real draft card (direct birth — no proposal/accept anymore), then BOTH sides
 * open the card panel from a fresh navigation so each starts from a known,
 * server-read state. After this each page shows the live draft card with the
 * Edit pencil reachable (no held change yet).
 */
export async function birthAndOpenDeal(
  alicePage: Page,
  bobPage: Page,
  opts?: { note?: string },
): Promise<void> {
  await createDraftDealAsAlice(alicePage, opts)
  await openDealInChat(alicePage, 'alice')
  await openDealInChat(bobPage, 'bob')
}
