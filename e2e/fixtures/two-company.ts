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
 *   3. `createDraftDealAsAlice(p)` — drive the in-app deal-CREATE flow to birth
 *                                    AND SEND a live deal card both sides can
 *                                    act on (the LOCAL DB has no seeded cloud
 *                                    card, so every test mints its own).
 *
 * THE CURRENT (Phase 12 birth/send split) flow, driven here:
 *   DealPin.tsx's "Start a deal" button dispatches `hs:create-deal-card`, which
 *   `DealCardPanelHost` (src/app/connect/DealCardPanelHost.tsx) turns into an
 *   empty CREATE-mode card in the SAME 50/50 side panel a real card uses — the
 *   real `CardFront`/`DealCard` component, permanently in edit mode, seeded via
 *   `emptyDraftView(buyerName)`. Birth and delivery are now TWO steps (D-13 /
 *   D-06): the create footer's "Save draft" births a PRIVATE `unsent` card
 *   (createDeal — the counterparty sees NOTHING yet, RLS D-08) and the panel
 *   swaps to the born card in place; the born card's DecisionBar then owns the
 *   ONE "Send deal" button (sendDeal -> the send_deal RPC), which delivers the
 *   deal and flips it to `negotiation` — only then does the other side see it.
 *   There is no accept step for the other side; `acceptBirthAsBob` (the old
 *   propose->accept birth door) no longer exists.
 *
 * Selectors mirror the real components as read this session:
 *   - login form (src/app/(auth)/login/page.tsx + AuthCard.tsx):
 *       input[name="email"], input[name="password"], a "Sign in" submit button.
 *   - the deal card panel: `<aside aria-label="Deal card">` (dealPanel below),
 *     mounted once at the Connect layout root (DealCardPanelHost).
 *   - the create-mode card (CardFront.tsx): a `+ Add product from your shop…`
 *     `<select>` (seller-only, only rendered when the catalogue is non-empty),
 *     per-row Batch/Unit-size `<select>`s (MOCK options, no real batch data),
 *     a Price `<input type="number">`, a Note `<textarea>`, and a "Save draft"
 *     button (disabled until at least one product line exists).
 *   - the born card (DecisionBar.tsx): "Send deal" while `unsent`; after the
 *     send flip the initiator's bar reads "Waiting for the other side to
 *     sign." — the negotiation-unique signal the fixtures wait on.
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
-- a getByText assertion match the stale bubble. Widen this delete to clear all
-- projection types from the relationship's p2p thread - including the two Wave 3b
-- pills (E1 'deal_change_proposed' / B1 'deal_negotiation_requested'), which also
-- persist on the p2p thread across serial tests.
DELETE FROM chat_message
  WHERE type IN ('deal_detected', 'deal_card_updated', 'deal_change_declined',
                 'deal_card', 'deal_cancelled', 'deal_signed',
                 'deal_change_proposed', 'deal_negotiation_requested')
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
 * Count the live `deal_pending_change` rows for ONE deal card (B3). A decline is
 * an END: after `declineDeal` runs, no HELD change may survive on the now-closed
 * card - a stale row would leave a ghost diff. Mirrors
 * `countDealChangeInputForCard`'s shape exactly; the card id is passed in by the
 * caller, resolved at RUNTIME from the freshly-born card (NEVER hardcoded - the
 * seed regenerates ids on every `supabase db reset`).
 */
export function countPendingChangesForCard(dealCardId: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.deal_pending_change where deal_card_id = '${dealCardId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Count the live `deal_member` rows across ONE card's workspace (A1). A deal
 * born from a c2c COMPANY chat has no counterparty person, so its creator must
 * be the SOLE owner — that absence is the company-target routing key
 * `send_deal` reads DIRECTLY (STALE until this correction: T01/HEL-63 deleted
 * `send_deal`'s call to `deliver_deal` from this arm entirely — the routing
 * decision is made inline in the function's own branch now, per
 * `20260825090000_send_deal_c2c_announce.sql:124-196`. `deliver_deal` keeps
 * exactly one caller today, `confirm_detected_deal_births_negotiation`, per
 * PLAN-T03 §4 step 5 N7). Card id resolved at RUNTIME by the caller (never
 * hardcoded — the seed regenerates ids on every db reset).
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
 * stayed silent. STALE-CORRECTED (T01/HEL-63): this is now ALSO the
 * authoritative assertion for a COMPANY-target send — `send_deal`'s c2c arm no
 * longer calls `deliver_deal` at all, so a company-addressed deal stays at 0
 * here too (`deal-lands-in-c2c-chat.spec.ts`); before T01 the same send
 * produced 1. Card id resolved at RUNTIME by the caller.
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

/**
 * The sorted line quantities of a card's currently-HELD change draft (C3). The
 * held draft's `draft->line_items[]` carry the SHARED proposed shape; this
 * returns each line's `quantity` ascending, so a test can prove BOTH proposed
 * values SURVIVED a replace (withdraw + re-propose) - the C3 data-loss guard.
 * A held note renders nowhere in the UI while only held, and neither does a held
 * LINE (the read view shows the base + a diff, not the held draft's own array),
 * so this DB read is the honest signal. Empty when no change is held. Card id
 * resolved at RUNTIME by the caller (never hardcoded - the seed regenerates ids
 * on every `supabase db reset`).
 */
export function pendingChangeLineQuantities(dealCardId: string): number[] {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select coalesce(string_agg((li->>'quantity'), ',' order by (li->>'quantity')::numeric), '') ` +
        `from public.deal_pending_change dpc, ` +
        `lateral jsonb_array_elements(dpc.draft->'line_items') li ` +
        `where dpc.deal_card_id = '${dealCardId}'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return out ? out.split(',').map(Number) : []
}

/**
 * Count the live `pending_inbox_item` rows for ONE per-product pricing ask
 * (0022 T04, HEL-58's dup-guard proof): type 'pricelist_request', status
 * pending, not soft-deleted, sent BY the named company, carrying the id of
 * the product with the given `supplier_product_code` — always looked up on
 * GreenLeaf (the seller every T04 e2e test asks against), by NAME, never a
 * hardcoded company id, same rule as `resolveRelationshipId` above.
 *
 * Scoped by BOTH sender company name AND product code so two tests asking
 * about different products (or from different senders) never collide on one
 * count — mirrors `countTicketsForCard`'s per-card scoping.
 *
 * CALLER CONTRACT: `senderCompanyName` and `productCode` are interpolated raw
 * into single-quoted SQL literals — no escaping, no parameter binding. Pass
 * LITERAL CONSTANTS written in the spec file. Never pass a name read back out
 * of the DB, scraped off the page, or otherwise derived at runtime: company
 * names are user-authored in this product, and one apostrophe would break the
 * query out of its literal. (Today's callers all pass fixed strings.)
 */
export function countPricingRequests(senderCompanyName: string, productCode: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.pending_inbox_item pi ` +
        `join public.company sc on sc.id = pi.sender_company_id ` +
        `join public.company gl on gl.name = 'GreenLeaf Cultivation' ` +
        `join public.product p on p.company_id = gl.id and p.supplier_product_code = '${productCode}' ` +
        `where sc.name = '${senderCompanyName}' and pi.type = 'pricelist_request' ` +
        `and pi.status = 'pending' and pi.deleted_at is null ` +
        `and pi.metadata->>'product_id' = p.id::text`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * The `note` of the ONE live per-product pricing ask a company sent GreenLeaf
 * about a product (by `supplier_product_code`), or null if none exists.
 * `countPricingRequests` proves the ROW exists; this proves what it SAYS —
 * D3's note must name the product, which is what makes T04's criterion 2 true
 * "to the seller's eye" (the note renders in InboxRow / InboxDetail; a bare
 * `metadata` key renders nowhere). Same scoping — and the same CALLER CONTRACT
 * as the counter above: both parameters are interpolated raw into single-quoted
 * SQL literals, so callers must pass literal constants, never runtime-derived
 * names.
 */
export function pricingRequestNote(senderCompanyName: string, productCode: string): string | null {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select pi.note from public.pending_inbox_item pi ` +
        `join public.company sc on sc.id = pi.sender_company_id ` +
        `join public.company gl on gl.name = 'GreenLeaf Cultivation' ` +
        `join public.product p on p.company_id = gl.id and p.supplier_product_code = '${productCode}' ` +
        `where sc.name = '${senderCompanyName}' and pi.type = 'pricelist_request' ` +
        `and pi.status = 'pending' and pi.deleted_at is null ` +
        `and pi.metadata->>'product_id' = p.id::text limit 1`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return out || null
}

/**
 * The `status` of the ONE per-product pricing ask a company sent GreenLeaf, or
 * null if no such row exists. Same scoping and the same CALLER CONTRACT as
 * `countPricingRequests` above (both parameters interpolated raw — pass literal
 * constants only), but WITHOUT that helper's `status = 'pending'` filter, which
 * is the whole point: this is what distinguishes an accept that landed from one
 * that silently rolled back and left the item pending forever (DEV-83).
 */
export function pricingRequestStatus(
  senderCompanyName: string,
  productCode: string,
): string | null {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select pi.status from public.pending_inbox_item pi ` +
        `join public.company sc on sc.id = pi.sender_company_id ` +
        `join public.company gl on gl.name = 'GreenLeaf Cultivation' ` +
        `join public.product p on p.company_id = gl.id and p.supplier_product_code = '${productCode}' ` +
        `where sc.name = '${senderCompanyName}' and pi.type = 'pricelist_request' ` +
        `and pi.deleted_at is null ` +
        `and pi.metadata->>'product_id' = p.id::text limit 1`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return out || null
}

/**
 * How many live relationships exist between GreenLeaf and StonePharm.
 * `uq_relationship_pair_active` says this is at most 1 — asserting it directly
 * is what proves an accept ADOPTED the seeded relationship rather than trying
 * to mint a second one (DEV-83's `23505`).
 */
export function countActiveRelationshipsForPair(): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.relationship r ` +
        `join public.company a on a.id = r.company_a_id ` +
        `join public.company b on b.id = r.company_b_id ` +
        `where r.deleted_at is null ` +
        `and (a.name, b.name) in ` +
        `(('GreenLeaf Cultivation','StonePharm'),('StonePharm','GreenLeaf Cultivation'))`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Threads of one `type` on the GreenLeaf <-> StonePharm relationship.
 * `uq_chat_thread_c2c` allows one c2c; a P2P is created per person pair. Used
 * to prove an accept on an ADOPTED relationship still opens the P2P the
 * rollout calls for, without duplicating the C2C that already existed.
 */
export function countThreadsForPair(threadType: 'c2c' | 'p2p'): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.chat_thread t ` +
        `join public.relationship r on r.id = t.relationship_id ` +
        `join public.company a on a.id = r.company_a_id ` +
        `join public.company b on b.id = r.company_b_id ` +
        `where t.deleted_at is null and r.deleted_at is null ` +
        `and t.type = '${threadType}' ` +
        `and (a.name, b.name) in ` +
        `(('GreenLeaf Cultivation','StonePharm'),('StonePharm','GreenLeaf Cultivation'))`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Count the live `deal_card` chat-message pills on ONE thread type (`c2c` or
 * `p2p`) of the GreenLeaf <-> StonePharm relationship. T01/HEL-63 makes
 * `send_deal` post this pill into the c2c thread for a company-target deal and
 * into the p2p thread for a person-target deal, never both — this is the row
 * fact that proves WHICH thread the pill landed in, since the UI only ever
 * shows one thread at a time and "the pill is in c2c and NOT in p2p" is not
 * otherwise checkable in a single state (L-019 — prove the row; L-021 —
 * presence AND absence on the same state). Relationship resolved at RUNTIME by
 * company name, like every sibling helper here — never a hardcoded id.
 */
export function countDealPillsOnThread(threadType: 'c2c' | 'p2p'): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.chat_message m ` +
        `join public.chat_thread t on t.id = m.thread_id ` +
        `join public.relationship r on r.id = t.relationship_id ` +
        `join public.company a on a.id = r.company_a_id ` +
        `join public.company b on b.id = r.company_b_id ` +
        `where m.type = 'deal_card' and t.type = '${threadType}' ` +
        `and m.deleted_at is null and t.deleted_at is null ` +
        `and (a.name, b.name) in ` +
        `(('GreenLeaf Cultivation','StonePharm'),('StonePharm','GreenLeaf Cultivation'))`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * How many `connection_established` system lines sit on the GreenLeaf <->
 * StonePharm C2C thread. Two already-connected companies must never be told
 * they are "now connected" a second time, so this stays at its seeded value
 * across an accept — the assertion that seed lines are written ONLY for a
 * thread the accept actually creates.
 */
export function countConnectionEstablishedLines(): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.chat_message m ` +
        `join public.chat_thread t on t.id = m.thread_id ` +
        `join public.relationship r on r.id = t.relationship_id ` +
        `join public.company a on a.id = r.company_a_id ` +
        `join public.company b on b.id = r.company_b_id ` +
        `where m.type = 'connection_established' and t.type = 'c2c' ` +
        `and t.deleted_at is null and r.deleted_at is null ` +
        `and (a.name, b.name) in ` +
        `(('GreenLeaf Cultivation','StonePharm'),('StonePharm','GreenLeaf Cultivation'))`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Live `connect_person` requests aimed at Alice. The seed always plants one
 * (Clara Vogt -> Alice, seed.sql:1139-1157), which is what makes the inbox
 * regression test meaningful rather than vacuous: if this ever returns 0 the
 * test is asserting nothing and must be re-seeded, not deleted.
 */
export function countPersonRequestsForAlice(): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL,
      '-At',
      '-c',
      `select count(*) from public.pending_inbox_item i ` +
        `join public.person rp on rp.id = i.receiver_person_id ` +
        `where i.type = 'connect_person' and i.status = 'pending' ` +
        `and i.deleted_at is null ` +
        `and rp.first_name = 'Alice' and rp.last_name = 'Green'`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}

/**
 * Remove StonePharm's pricing asks to GreenLeaf so the accept test starts from
 * "no ask yet" on a DB other tests have already used. Without this the ask from
 * a previous run is still `accepted`, T04's per-product dup-guard refuses to
 * create a second one, and the test asserts against a stale row.
 *
 * Deletes the inbox rows ONLY - never the relationship or its threads, which is
 * the very state the test needs to be already connected.
 */
export function resetPricingRequests(): void {
  const bin = psqlBin()
  execFileSync(
    bin,
    [
      DB_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `delete from public.pending_inbox_item pi ` +
        `using public.company sc, public.company rc ` +
        `where sc.id = pi.sender_company_id and rc.id = pi.receiver_company_id ` +
        `and sc.name = 'StonePharm' and rc.name = 'GreenLeaf Cultivation' ` +
        `and pi.type = 'pricelist_request'`,
    ],
    { encoding: 'utf8' },
  )
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
 * Drive the in-app deal-CREATE flow as Alice to mint a fresh, DELIVERED deal
 * card with StonePharm — birth as a private draft, then the explicit Send
 * (Phase 12 birth/send split, see the module header). Callers only ever
 * receive a deal Bob can see and act on (status `negotiation`).
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
 *   6. click "Save draft" — births a PRIVATE `unsent` card (`createDeal`) and
 *      swaps the panel to the born card in place (no navigation). Bob sees
 *      nothing yet (RLS, D-08).
 *   7. click the born card's DecisionBar "Send deal" — `sendDeal` -> the
 *      `send_deal` RPC delivers the deal and flips it to `negotiation`. THIS
 *      fixture's deal is PERSON-addressed (born from the p2p thread), so
 *      delivery is a `deal_card` pill in the p2p thread — STALE-CORRECTED
 *      (T01/HEL-63): never a `pending_inbox_item` ticket, not even for the
 *      OTHER (company-target) arm any more — `createC2cDealAsAlice` below now
 *      delivers the same pill shape into the c2c thread instead, and neither
 *      arm mints a ticket on send.
 *
 * Deterministic product: "Pedanios 31/1 COS-CA" (seed.sql section 6, GreenLeaf's
 * AUR-1A) — always present in Alice's catalogue on a fresh `supabase db reset`.
 */
export async function createDraftDealAsAlice(
  alicePage: Page,
  opts?: { note?: string },
): Promise<void> {
  // steps 1-6: birth the private 'unsent' draft (the card is born but Bob still
  // sees NOTHING - RLS, D-08).
  await birthDraftDealAsAlice(alicePage, opts)

  // 7. SEND it (Phase 12 D-06/D-12: the born card's DecisionBar owns the ONE
  //    "Send deal" path — birth alone leaves the card invisible to Bob, D-08).
  //    Wait on a NEGOTIATION-unique signal before returning: the initiator's
  //    "Waiting for the other side to sign." line renders ONLY in DecisionBar's
  //    negotiation branch (an unsent card shows the "Send deal" button
  //    instead), so its appearance proves the send flip landed server-side —
  //    callers must only ever receive a DELIVERED deal.
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage).getByText(/waiting for the other side to sign/i).waitFor({
    timeout: 15000,
  })
}

/**
 * Birth a PRIVATE `unsent` draft deal as Alice, WITHOUT sending it — steps 1-6
 * of the create flow only (the Phase-12 birth half, D-13). Drives the create
 * card through "Save draft" and stops the instant the born 'unsent' card swaps
 * into the panel (the "Edit deal" pencil is the born-card-only signal). The card
 * is left OPEN on Alice's panel in READ mode with the DecisionBar showing "Send
 * deal"; the counterparty sees nothing yet (RLS, D-08).
 *
 * Used by `createDraftDealAsAlice` (which then presses Send) AND by the CR-02
 * draft-edit test, which edits the still-`unsent` draft IN PLACE (update_deal_draft)
 * and must never send it — the pre-Send state cannot be reached from the shared
 * beforeEach card (that one is already a sent 'negotiation' deal).
 */
export async function birthDraftDealAsAlice(
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

  // 3. pick a real product from Alice's own catalogue. `selectOption` fires a real
  //    change event, which CardFront's addFromCatalog turns into a fresh,
  //    auto-opened line.
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

  // 6. birth it for real — "Save draft" (Phase 12 D-13: the create footer only
  //    births; delivery moved to the card's own Send). Wait for a signal UNIQUE
  //    to the BORN card: the "Edit deal" pencil (hidden in create mode, always
  //    present on a fresh draft with no held change).
  //    ⚠️ NOT "Talk about this deal" — the CREATE-mode card shows that pill
  //    too, so it can resolve while the birth roundtrip is still in flight;
  //    a caller that keeps driving the panel then races handleCreate's
  //    completion (which closes any create session and swaps the born card in).
  await dealPanel(alicePage).getByRole('button', { name: /^save draft$/i }).click()
  await dealPanel(alicePage).getByRole('button', { name: /edit deal/i }).waitFor({
    timeout: 15000,
  })
}

/**
 * Birth AND SEND a TWO-line deal as Alice (C3 substrate). Same create flow as
 * `createDraftDealAsAlice`, but adds a SECOND catalogue product (San Raf 29/1 PNK,
 * seed.sql section 6, GreenLeaf AUR-1C) before "Save draft", so the born + sent
 * deal carries two `deal_line_item` rows — what the replace-keeps-both-lines test
 * needs. Both lines birth at 100 g; the test proposes/re-proposes over them.
 */
export async function createTwoLineDraftDealAsAlice(alicePage: Page): Promise<void> {
  await alicePage.goto('/connect/chat')
  await alicePage.getByText(COUNTERPARTY_NAME.alice, { exact: false }).first().click()
  await alicePage.getByRole('button', { name: 'Start a deal', exact: true }).click()
  const addProductSelect = dealPanel(alicePage)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()

  // line 1: Pedanios 31/1 COS-CA @ 100 g / 5.00 (auto-opens the row).
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row1 = openRowLocator(alicePage)
  await row1.locator('select').nth(2).selectOption('100')
  await row1.locator('input[type="number"]').fill('5.00')

  // line 2: San Raf 29/1 PNK @ 100 g / 4.00. Adding it auto-opens the new row and
  // collapses line 1 (its 100 g/5.00 stay in the working copy). The add-select
  // stays reachable (it renders in edit mode regardless of the open row).
  await addProductSelect.selectOption({ label: 'San Raf 29/1 PNK' })
  const row2 = openRowLocator(alicePage)
  await row2.locator('select').nth(2).selectOption('100')
  await row2.locator('input[type="number"]').fill('4.00')

  // birth ("Save draft") then send — same waits as createDraftDealAsAlice.
  await dealPanel(alicePage).getByRole('button', { name: /^save draft$/i }).click()
  await dealPanel(alicePage)
    .getByRole('button', { name: /edit deal/i })
    .waitFor({ timeout: 15000 })
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage).getByText(/waiting for the other side to sign/i).waitFor({
    timeout: 15000,
  })
}

/**
 * Drive the c2c (COMPANY chat) deal-create flow as Alice (Lane A): open the
 * GreenLeaf<->StonePharm company channel (found by its fixed "Company chat
 * (C2C)" subtitle after narrowing the list by search — the p2p row subtitles
 * the company name instead), press its "Start a deal" door, and birth + SEND
 * the same deterministic Pedanios deal as createDraftDealAsAlice. No
 * counterparty person exists in a company chat, so the deal is COMPANY-target.
 * STALE-CORRECTED (T01/HEL-63, `deal-lands-in-c2c-chat.spec.ts`): this
 * docstring used to say SEND mints a claimable StonePharm inbox ticket via
 * `deliver_deal` — that call was DELETED from `send_deal`'s c2c arm. SEND now
 * posts the `deal_card` pill DIRECTLY into the relationship's c2c thread and
 * creates ZERO `pending_inbox_item` rows; there is no ticket to assert the
 * existence of any more, only the pill (`countDealPillsOnThread('c2c')`).
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
  // birth ("Save draft") — wait on the BORN-card-only pencil, not "Talk about
  // this deal" (the create card shows that too — see createDraftDealAsAlice's
  // note on the race)
  await dealPanel(alicePage).getByRole('button', { name: /^save draft$/i }).click()
  await dealPanel(alicePage)
    .getByRole('button', { name: /edit deal/i })
    .waitFor({ timeout: 15000 })
  // the explicit Send (company-target: STALE-CORRECTED — this is the moment
  // the c2c pill posts, not a StonePharm inbox ticket; T01/HEL-63 deleted that
  // ticket mint from this arm entirely) — wait on the negotiation-unique
  // DecisionBar signal, exactly as createDraftDealAsAlice does.
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage).getByText(/waiting for the other side to sign/i).waitFor({
    timeout: 15000,
  })
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
 * WHY this deterministic re-read (rather than waiting on a live update):
 * DealPin.tsx subscribes to postgres_changes on `deal_pending_change`, and in
 * these tests the OTHER side's pencil-lock / DecisionBar content sometimes does
 * not reflect a change until a refresh.
 *
 * VERIFIED FACT: both `deal_pending_change` (migration 20260617130000) and
 * `deal_card` (migration 20260618120010) ARE members of the `supabase_realtime`
 * publication — guarded by supabase/tests/realtime_publication_test.sql. The
 * earlier "never added to supabase_realtime" claim was FALSE (it predated
 * 20260617130000). So a missing publication is NOT the cause.
 *
 * HYPOTHESIS (not verified — confirm with a live probe before asserting it):
 * whatever makes the update not arrive live on the other side is something else
 * — candidates are the client's realtime auth token, RLS on the receiving
 * subscription, or test timing. Until a probe pins it down, this helper simply
 * re-reads the authoritative server state directly, so the tests still verify the
 * real success criteria (both sides locked, the two-sided sign / negotiate
 * resolution). It does NOT weaken any assertion — it only re-reads server state.
 */
export async function refreshDealView(page: Page, who: Who): Promise<void> {
  await openDealInChat(page, who)
}

/**
 * Full two-sided setup the negotiate/sign tests need: Alice creates, births AND
 * SENDS a real deal card (the Phase-12 two-step — Bob can only see the card
 * once it is sent), then BOTH sides open the card panel from a fresh navigation
 * so each starts from a known, server-read state. After this each page shows
 * the live `negotiation` card with the Edit pencil reachable (no held change
 * yet).
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
