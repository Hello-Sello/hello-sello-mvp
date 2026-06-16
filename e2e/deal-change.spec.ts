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
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import {
  openTwoContexts,
  createDraftDealAsAlice,
  COUNTERPARTY_NAME,
} from './fixtures/two-company.ts'

// shared two-context handles, set up fresh per test so no state leaks between them
let aliceContext: BrowserContext
let bobContext: BrowserContext
let alicePage: Page
let bobPage: Page

test.beforeEach(async ({ browser }) => {
  ;({ aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser))
  // mint a fresh draft deal both sides can act on (local has no seeded card)
  await createDraftDealAsAlice(alicePage)
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
 * held-not-committed (DCHG-01 / DCHG-02): Alice edits a draft and sends with a
 * reason. The LIVE card version is unchanged (the change is held, not
 * committed), and the strip shows the change as awaiting the other side with
 * Alice's own side already accepted (auto-accept).
 */
test('held-not-committed + auto-accept: edit holds, live card version unchanged, proposer pre-accepted', async () => {
  await editPencil(alicePage).click()
  // change a shared term and send with a required reason (collected in the strip)
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // the live card stays at its original version — the change is HELD
  await expect(alicePage.getByText(/v1\b/i)).toBeVisible()
  // and the strip shows the change pending from the OTHER side (auto-accept)
  await expect(
    alicePage.getByText(new RegExp(`awaiting ${COUNTERPARTY_NAME.alice}`, 'i')),
  ).toBeVisible()
})

/**
 * full-lock (DCHG-03): while a change is pending, the Edit pencil is
 * disabled/absent on BOTH Alice's and Bob's screens — one paper on the table.
 */
test('full-lock: edit pencil locked on both screens while a change is pending', async () => {
  await editPencil(alicePage).click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // the pencil is gone (or disabled) for BOTH companies until the change resolves
  await expect(editPencil(alicePage)).toHaveCount(0)
  await expect(editPencil(bobPage)).toHaveCount(0)
})

/**
 * reason-required (REAS-01): in the strip Accept/Decline pop-up, both the Accept
 * and Decline buttons are disabled until a change reason is typed.
 */
test('reason-required: accept and decline are disabled until a reason is typed', async () => {
  await editPencil(alicePage).click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // Bob opens the review pop-up — reason empty, so both actions are blocked
  await bobPage.getByRole('button', { name: /review/i }).click()
  await expect(bobPage.getByRole('button', { name: /^accept$/i })).toBeDisabled()
  await expect(bobPage.getByRole('button', { name: /^decline$/i })).toBeDisabled()

  // after typing a reason, both unlock
  await bobPage.getByRole('textbox', { name: /reason/i }).fill('Agreed, 120 works')
  await expect(bobPage.getByRole('button', { name: /^accept$/i })).toBeEnabled()
  await expect(bobPage.getByRole('button', { name: /^decline$/i })).toBeEnabled()
})

/**
 * two-sided-commit (DCHG-04): Bob accepts with a reason; the card version
 * increments by one and status stays `draft`; the pending change clears on
 * both screens.
 */
test('two-sided-commit: both accept commits to base+1, status stays draft, pending clears', async () => {
  await editPencil(alicePage).click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // Bob accepts with his own reason
  await bobPage.getByRole('button', { name: /review/i }).click()
  await bobPage.getByRole('textbox', { name: /reason/i }).fill('Agreed, 120 works')
  await bobPage.getByRole('button', { name: /^accept$/i }).click()

  // the card commits to v2, still draft, on both screens; pending is gone
  await expect(alicePage.getByText(/v2\b/i)).toBeVisible()
  await expect(alicePage.getByText(/draft/i)).toBeVisible()
  await expect(bobPage.getByText(/v2\b/i)).toBeVisible()
  await expect(alicePage.getByText(/awaiting|review/i)).toHaveCount(0)
})

/**
 * decline-discards (DCHG-05): Bob declines with a reason; the card version is
 * unchanged, the pending change clears, and the Edit pencil unlocks again.
 */
test('decline-discards: decline leaves the card unchanged, clears pending, unlocks the pencil', async () => {
  await editPencil(alicePage).click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  await bobPage.getByRole('button', { name: /review/i }).click()
  await bobPage.getByRole('textbox', { name: /reason/i }).fill('Stay at 100 for now')
  await bobPage.getByRole('button', { name: /^decline$/i }).click()

  // the card stays at v1 and the pencil is editable again on both screens
  await expect(alicePage.getByText(/v1\b/i)).toBeVisible()
  await expect(editPencil(alicePage)).toBeVisible()
  await expect(editPencil(bobPage)).toBeVisible()
})

/**
 * withdraw (DCHG-06): Alice withdraws her own pending change with NO reason
 * prompt; the pending change clears and the pencil unlocks.
 */
test('withdraw: proposer withdraws with no reason prompt, clears pending, unlocks the pencil', async () => {
  await editPencil(alicePage).click()
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // Alice withdraws — there is no reason prompt for a take-back
  await alicePage.getByRole('button', { name: /withdraw/i }).click()

  // the change is gone and editing is unlocked again on both screens
  await expect(alicePage.getByText(/awaiting|review/i)).toHaveCount(0)
  await expect(editPencil(alicePage)).toBeVisible()
  await expect(editPencil(bobPage)).toBeVisible()
})

/**
 * private-immediate (DCHG-07): Alice's private field (Buying price) edited in
 * the form persists for Alice immediately after send and is never visible to
 * Bob in the strip.
 */
test('private-immediate: private buying price saves at once for Alice and never leaks to Bob', async () => {
  await editPencil(alicePage).click()
  // the private box is the seller-only "Buying price" input
  await alicePage.getByPlaceholder(/€ \/ g/i).first().fill('3.50')
  await alicePage.getByPlaceholder(/qty/i).first().fill('120')
  await alicePage.getByRole('button', { name: /send/i }).click()
  await alicePage.getByRole('textbox', { name: /reason/i }).fill('Increase quantity to 120')
  await alicePage.getByRole('button', { name: /^send change$/i }).click()

  // Alice still sees her private value immediately (saved ungated, pre-commit)
  await editPencil(alicePage).click()
  await expect(alicePage.getByPlaceholder(/€ \/ g/i).first()).toHaveValue(/3\.50/)
  // and Bob must NEVER see Alice's private buying price anywhere in the strip
  await expect(bobPage.getByText(/3\.50/)).toHaveCount(0)
})
