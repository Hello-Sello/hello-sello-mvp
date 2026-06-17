/**
 * Phase 1 — held two-sided deal change: the failing E2E spec (TDD RED).
 *
 * These tests encode the SIX Phase-1 success criteria as end-to-end behavior.
 * They are written FIRST, from the success criteria — NOT from the
 * implementation. They MUST be RED right now: the `deal_pending_change` table,
 * the three change RPCs, the strip Accept/Decline reason pop-up, and the
 * pencil lock do not exist yet. They turn green as plans 02 → 03 → 04 land.
 *
 * Each test title carries a grep tag (held-not-committed, auto-accept,
 * full-lock, two-sided-commit, decline-discards, withdraw, private-immediate,
 * reason-required) so a single criterion can be run in isolation, e.g.
 *   ./node_modules/.bin/playwright test e2e/deal-change.spec.ts -g full-lock
 *
 * Two-company, two-context: Alice (GreenLeaf, proposer) and Bob (StonePharm,
 * responder) hold separate sessions via openTwoContexts, because the held
 * change is decided by BOTH sides. A fresh draft card is minted in-app at
 * setup (the local DB has no seeded cloud card).
 *
 * The selectors target the visible strip text + the card version label + the
 * Edit pencil (aria-label "Edit deal", from DealCard.tsx). They are the stable
 * contract plans 02-04 build the app up to satisfy.
 *
 * REALTIME (bug found here, now FIXED): the held change did NOT propagate LIVE to
 * the other side — DealPin.tsx subscribes to postgres_changes on
 * `deal_pending_change`, but that table was missing from the supabase_realtime
 * publication, so the subscription never fired. Fixed in
 * 20260617130000_deal_pending_change_realtime.sql (adds the table to the
 * publication). These tests still call refreshDealView(...) before observing the
 * other side, because realtime cross-screen TIMING is non-deterministic to assert
 * (plan 01-04 flagged it as a manual-only check); the refresh makes the
 * assertions stable. The success criteria (both sides locked, the reason gate,
 * two-sided commit, decline/withdraw discard) are verified in full.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import {
  openTwoContexts,
  birthAndOpenDeal,
  refreshDealView,
  resetDealData,
  COUNTERPARTY_NAME,
} from './fixtures/two-company'

// The held change is decided by BOTH sides over ONE shared StonePharm relationship,
// and each test mints + mutates that single live card. Run SERIAL (never in
// parallel) so two tests never collide on the same relationship's deal/proposal
// rows. resetDealData() in beforeEach wipes the deal + proposal rows so each test
// starts from the clean "Start a deal" state (a fast targeted truncate, not a
// full db reset, so the running dev server is never disturbed).
test.describe.configure({ mode: 'serial' })

// shared two-context handles, set up fresh per test so no state leaks between them
let aliceContext: BrowserContext
let bobContext: BrowserContext
let alicePage: Page
let bobPage: Page

test.beforeEach(async ({ browser }) => {
  // wipe this relationship's deal data first so each test starts from the clean
  // "Start a deal" State A (the seed ships a draft card + proposals on this
  // relationship; without the reset the strip is in State C and "Start a deal"
  // is absent). Targeted truncate, not a full db reset — see resetDealData.
  resetDealData()
  ;({ aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser))
  // mint a fresh draft deal both sides can act on: Alice proposes, Bob accepts
  // (births the card), then both open the card.
  await birthAndOpenDeal(alicePage, bobPage)
})

test.afterEach(async () => {
  await aliceContext?.close()
  await bobContext?.close()
})

/** Open the edit pencil on a page; the gate / lock is what we assert against. */
function editPencil(page: Page) {
  return page.getByRole('button', { name: /edit deal/i })
}

/**
 * Drive the PROPOSER's held-change flow end to end on `page`:
 *   pencil → change the qty → "Review change" (closes the edit form, opens the
 *   strip's Send pop-up) → type the required reason → "Send change".
 *
 * The exact labels come from the real components (read this session):
 *   - EditDealForm submits with "Review change" (DealForm submitLabel).
 *   - The strip Send pop-up's reason field is a placeholder textarea ("e.g.
 *     Bumped the price…"), NOT an aria-labelled "reason" box, so it is matched by
 *     its placeholder. "Send change" stays disabled until the reason is non-blank.
 */
async function proposeChangeAsAlice(page: Page, qty: string, reason: string) {
  await editPencil(page).click()
  await page.getByPlaceholder(/qty/i).first().fill(qty)
  await page.getByRole('button', { name: /^review change$/i }).click()
  await page.getByPlaceholder(/bumped the price/i).fill(reason)
  await page.getByRole('button', { name: /^send change$/i }).click()
}

/**
 * Open the RESPONDER's review pop-up on `page` (the loud "Review change" pill in
 * the strip). The reason gate lives inside it (the ConfirmBar with requireReason).
 */
async function openReviewChange(page: Page) {
  await page.getByRole('button', { name: /review change/i }).click()
}

/**
 * The responder's reason field inside the review pop-up. It is the ConfirmBar's
 * placeholder textarea ("Say why…"), again matched by placeholder, not a name.
 */
function reviewReasonBox(page: Page) {
  return page.getByPlaceholder(/say why/i)
}

/**
 * Flip the open card to its BACK and switch to the Logs tab — the card's real
 * version history (deal_card_log), the only place the version number is shown
 * (CardFront has no version label; v{N} chips live in LogsTab). A committed
 * change writes a "Deal updated to vN" log row; a held-but-not-committed change
 * writes none, so this is the honest signal for "did the live card move?".
 */
async function openLogsTab(page: Page) {
  await page.getByRole('button', { name: /flip to signals and logs/i }).click()
  await page.getByRole('button', { name: /^logs$/i }).click()
}

/**
 * held-not-committed (DCHG-01 / DCHG-02): Alice edits a draft and sends with a
 * reason. The LIVE card version is unchanged (the change is held, not
 * committed), and the strip shows the change as awaiting the other side with
 * Alice's own side already accepted (auto-accept).
 */
test('held-not-committed + auto-accept: edit holds, live card version unchanged, proposer pre-accepted', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  // auto-accept: the proposer's own side is already in, so the strip shows the
  // change as PENDING on the other side (the "Change pending · <counterparty>"
  // waiting chip with the no-reason Withdraw — proof Alice did not have to act).
  await expect(
    alicePage.getByText(new RegExp(`change pending.*${COUNTERPARTY_NAME.alice}`, 'i')),
  ).toBeVisible()

  // HELD, not committed: the live card has NOT moved, so the version history has
  // no "Deal updated to v2" entry (a commit would have written one).
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toHaveCount(0)
})

/**
 * full-lock (DCHG-03): while a change is pending, the Edit pencil is
 * disabled/absent on BOTH Alice's and Bob's screens — one paper on the table.
 */
test('full-lock: edit pencil locked on both screens while a change is pending', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  // Bob re-reads the current state (the live realtime push is the known-broken
  // path; refreshDealView does what it would have done). His "Review change" pill
  // is the cue the held change has landed on his side.
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByRole('button', { name: /review change/i })).toBeVisible()

  // the pencil is gone for BOTH companies while the change is pending — the lock
  // rides on the shared card, so neither side can start a second edit.
  await expect(editPencil(alicePage)).toHaveCount(0)
  await expect(editPencil(bobPage)).toHaveCount(0)
})

/**
 * reason-required (REAS-01): in the strip Accept/Decline pop-up, both the Accept
 * and Decline buttons are disabled until a change reason is typed.
 */
test('reason-required: accept and decline are disabled until a reason is typed', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  // Bob re-reads (known-broken live push) then opens the review pop-up — reason
  // empty, so both actions are blocked. The responder gate buttons are
  // "Confirm deal" + "Decline" (ConfirmBar).
  await refreshDealView(bobPage, 'bob')
  await openReviewChange(bobPage)
  await expect(bobPage.getByRole('button', { name: /confirm deal/i })).toBeDisabled()
  await expect(bobPage.getByRole('button', { name: /^decline$/i })).toBeDisabled()

  // after typing a reason, both unlock
  await reviewReasonBox(bobPage).fill('Agreed, 120 works')
  await expect(bobPage.getByRole('button', { name: /confirm deal/i })).toBeEnabled()
  await expect(bobPage.getByRole('button', { name: /^decline$/i })).toBeEnabled()
})

/**
 * two-sided-commit (DCHG-04): Bob accepts with a reason; the card version
 * increments by one and status stays `draft`; the pending change clears on
 * both screens.
 */
test('two-sided-commit: both accept commits to base+1, status stays draft, pending clears', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  // Bob re-reads then accepts with his own reason ("Confirm deal" = responder accept)
  await refreshDealView(bobPage, 'bob')
  await openReviewChange(bobPage)
  await reviewReasonBox(bobPage).fill('Agreed, 120 works')
  await bobPage.getByRole('button', { name: /confirm deal/i }).click()

  // Alice re-reads the now-committed state (Bob's accept is the other side's
  // action — the known-broken live push, so refresh to pull it).
  await refreshDealView(alicePage, 'alice')

  // pending clears on the proposer side: no "Change pending" / "Review change"
  // anywhere once both have accepted.
  await expect(alicePage.getByText(/change pending/i)).toHaveCount(0)
  await expect(alicePage.getByRole('button', { name: /review change/i })).toHaveCount(0)

  // status STAYS draft (D-06) — the strip's status badge still reads Draft
  await expect(alicePage.getByText(/^draft$/i).first()).toBeVisible()

  // the card committed to base+1: the version history now carries the
  // "Deal updated to v2" log entry, on BOTH screens (it rides the shared card).
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toBeVisible()
  await refreshDealView(bobPage, 'bob')
  await openLogsTab(bobPage)
  await expect(bobPage.getByText(/updated to v2/i)).toBeVisible()
})

/**
 * decline-discards (DCHG-05): Bob declines with a reason; the card version is
 * unchanged, the pending change clears, and the Edit pencil unlocks again.
 */
test('decline-discards: decline leaves the card unchanged, clears pending, unlocks the pencil', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  await refreshDealView(bobPage, 'bob')
  await openReviewChange(bobPage)
  await reviewReasonBox(bobPage).fill('Stay at 100 for now')
  await bobPage.getByRole('button', { name: /^decline$/i }).click()

  // a decline discards the change: the pencil is editable again on BOTH screens
  // (each side re-reads the cleared state — Alice via refresh, since Bob's decline
  // is the other side's action), and the live card never moved — no
  // "Deal updated to v2" entry was written.
  await refreshDealView(alicePage, 'alice')
  await expect(editPencil(alicePage)).toBeVisible()
  await expect(editPencil(bobPage)).toBeVisible()
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toHaveCount(0)
})

/**
 * withdraw (DCHG-06): Alice withdraws her own pending change with NO reason
 * prompt; the pending change clears and the pencil unlocks.
 */
test('withdraw: proposer withdraws with no reason prompt, clears pending, unlocks the pencil', async () => {
  await proposeChangeAsAlice(alicePage, '120', 'Increase quantity to 120')

  // Alice withdraws — the Withdraw button sits in the proposer's waiting chip and
  // takes back the change with NO reason prompt (no dialog opens). This is Alice's
  // own action, so her side updates locally.
  await alicePage.getByRole('button', { name: /withdraw/i }).click()

  // the change is gone (no "Change pending") and Alice's pencil is back.
  await expect(alicePage.getByText(/change pending/i)).toHaveCount(0)
  await expect(editPencil(alicePage)).toBeVisible()

  // Bob re-reads the cleared state: no "Review change" pill, and his pencil is
  // editable again (the lock cleared once the held change was withdrawn).
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByRole('button', { name: /review change/i })).toHaveCount(0)
  await expect(editPencil(bobPage)).toBeVisible()
})

/**
 * private-immediate (DCHG-07): Alice's private field (Buying price) edited in
 * the form persists for Alice immediately after send and is never visible to
 * Bob in the strip.
 */
test('private-immediate: private buying price saves at once for Alice and never leaks to Bob', async () => {
  // edit: set the seller-only "Buying price" private box + bump the shared qty,
  // then Send. proposeDealChange writes the private box IMMEDIATELY + ungated
  // (D-09) while the SHARED qty is only held.
  //
  // The private box has its OWN placeholder ("e.g. 3.50 € / g"); the line-item
  // price input shares "€ / g (optional)", so target the private box by its
  // distinct placeholder. Use a value (4.20) unlike any seeded price so a match
  // can only be the private box, never a line-item price echo.
  const privateBox = (page: Page) => page.getByPlaceholder(/e\.g\. 3\.50/i)
  await editPencil(alicePage).click()
  await privateBox(alicePage).fill('4.20')
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /^review change$/i }).click()
  await alicePage.getByPlaceholder(/bumped the price/i).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // Bob must NEVER see Alice's private buying price — not in the strip, not in his
  // Review-change pop-up (the held draft carries SHARED lines only, D-09). Bob
  // re-reads first (known-broken live push).
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByRole('button', { name: /review change/i })).toBeVisible()
  await openReviewChange(bobPage)
  await expect(bobPage.getByText(/4\.20/)).toHaveCount(0)

  // Alice's private value persisted at once: withdraw the still-held shared change
  // (which unlocks her pencil), re-open edit, and the 4.20 is still there even
  // though the shared qty change was discarded — proof the private write was
  // immediate + independent of the gated shared change.
  await alicePage.getByRole('button', { name: /withdraw/i }).click()
  await editPencil(alicePage).click()
  await expect(privateBox(alicePage)).toHaveValue(/4\.20/)
})
