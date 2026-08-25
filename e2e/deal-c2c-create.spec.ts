/**
 * Lane A — deal creation from the c2c (company) chat. The company-delivery
 * spine, POST T01/HEL-63 (`send_deal_c2c_announce`): birth -> SEND -> a
 * `deal_card` chat pill lands DIRECTLY in the c2c thread. There is no
 * inbox-ticket hop and no claim any more — `send_deal`'s call to
 * `deliver_deal` was DELETED for this arm (`20260825090000_send_deal_c2c_announce.sql:15-20`);
 * the last test in this file used to exercise "ticket -> Pick up deal ->
 * claim" and now exercises the reversed premise (point 4 below).
 *
 * Before this lane the c2c chat rendered DealPin's State A as just "No deal
 * yet": the "Start a deal" button + the `hs:create-deal` listener were gated on
 * `canPropose = variant === "chat" && !!threadId`, and ThreadView passes
 * `threadId: undefined` for a c2c conversation — so a company chat offered no
 * way to create a deal, and a born deal had no visible c2c surface.
 *
 * What this file proves, in order:
 *   1. the c2c chat offers "Start a deal"; through birth AND send the CREATOR
 *      stays the SOLE OWNER (no counterparty person exists in a company chat,
 *      and `send_deal` skips the co-owner insert when none is set — only a
 *      CLAIM ever added a second member, and this file no longer drives one);
 *   2. the born deal's row appears in the c2c chat LIVE (hs:deal-updated —
 *      the creator sees own drafts/deals in the strip);
 *   3. the row survives a fresh navigation and opens the card panel;
 *   4. the full company delivery, PREMISE REVERSED by T01/HEL-63: after the
 *      fixture's Send, the pill lands DIRECTLY in the OTHER company's c2c
 *      chat — no ticket, no "Pick up deal", no claim — and opens the SAME
 *      card from there; the creator remains the sole `deal_member` throughout
 *      (ADR 0006 §4.1:307 carries the safety analysis for this — cited, not
 *      re-derived here).
 *
 * Selectors mirror fixtures/two-company.ts (createC2cDealAsAlice drives the
 * create + send flow; the panel is `<aside aria-label="Deal card">`).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  loginAs,
  openTwoContexts,
  createC2cDealAsAlice,
  resetDealData,
  resolveDealCardIdForRelationship,
  countDealMembersForCard,
  countDealCardsForRelationship,
  countTicketsForCard,
  countDealPillsOnThread,
  dealPanel,
  COUNTERPARTY_NAME,
} from './fixtures/two-company'

// One shared GreenLeaf <-> StonePharm relationship; each test mints/wipes the
// deal on it — never parallel within this file.
test.describe.configure({ mode: 'serial' })

/** Open the GreenLeaf <-> StonePharm COMPANY (c2c) chat as the current user. */
async function openC2cChat(page: Page, counterparty: string = COUNTERPARTY_NAME.alice) {
  await page.goto('/connect/chat')
  await page.getByPlaceholder('Search conversations…').fill(counterparty)
  await page.getByText('Company chat (C2C)', { exact: true }).first().click()
}

test.beforeEach(() => {
  resetDealData()
})

test('c2c chat offers "Start a deal" and births a draft with the creator as sole owner', async ({
  page,
}) => {
  await loginAs(page, 'alice')
  await openC2cChat(page)

  // A1 core: the company chat must offer deal creation (was: "No deal yet" only)
  await expect(page.getByRole('button', { name: 'Start a deal', exact: true })).toBeVisible()

  await createC2cDealAsAlice(page)

  // no counterparty person exists in a company chat → the creator is the SOLE
  // deal_member owner through birth AND send (STALE-CORRECTED: this absence is
  // `send_deal`'s OWN company-target routing key at send time — T01/HEL-63
  // deleted its call to deliver_deal; only a claim ever added a member, and
  // there is no claim door left in this file, see the last test below)
  const cardId = resolveDealCardIdForRelationship()
  expect(countDealMembersForCard(cardId)).toBe(1)
})

test('the born deal row appears in the c2c chat LIVE — no reload needed', async ({ page }) => {
  await loginAs(page, 'alice')
  await createC2cDealAsAlice(page)

  // NO navigation: the strip must pick the born deal up from the panel host's
  // hs:deal-updated broadcast (the c2c chat has no p2p thread, so the realtime
  // channel never runs here). The deal chip row is the live-refresh proof.
  await expect(
    page.getByRole('button', { name: 'Open the deal card', exact: true }).first(),
  ).toBeVisible({ timeout: 10000 })
})

test('a born deal shows as a c2c row that opens the card', async ({ page }) => {
  await loginAs(page, 'alice')
  await createC2cDealAsAlice(page)

  // fresh navigation: the c2c chat still shows the born deal as its own row
  await openC2cChat(page)
  const openCard = page.getByRole('button', { name: 'Open the deal card', exact: true })
  await expect(openCard.first()).toBeVisible({ timeout: 15000 })
  await openCard.first().click()
  await dealPanel(page)
    .getByRole('button', { name: /talk about this deal/i })
    .waitFor({ timeout: 15000 })
})

test('a SECOND deal can be started from the same c2c chat — the button stays visible', async ({
  page,
}) => {
  await loginAs(page, 'alice')
  await createC2cDealAsAlice(page)

  // the first deal exists (its chip row is showing) — "Start a deal" must
  // STILL be offered so the chat can host more than one deal (Muskan's call,
  // 2026-07-20: multiple deal cards per company chat is the designed flow)
  const startAgain = page.getByRole('button', { name: 'Start a deal', exact: true })
  await expect(startAgain).toBeVisible({ timeout: 10000 })
  await startAgain.click()

  const addProductSelect = dealPanel(page)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()

  // the CREATE form is pre-birth: no deal exists yet, so the toolbar must not
  // offer "Talk about this deal" (it would point the group picker at a deal
  // id of "new", which cannot exist in the DB)
  await expect(
    dealPanel(page).getByRole('button', { name: /talk about this deal/i }),
  ).toHaveCount(0)
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row = dealPanel(page)
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: /done editing this line/i }) })
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('7.50')
  // "Save draft" births the second card (Phase 12: this test proves the DOOR
  // works, so the private draft is enough — no Send needed for the count)
  await dealPanel(page).getByRole('button', { name: /^save draft$/i }).click()
  // BORN-card-only signal (the create card also shows "Talk about this deal")
  await dealPanel(page).getByRole('button', { name: /edit deal/i }).waitFor({ timeout: 15000 })

  // a genuinely NEW card was born (not an edit of the first)
  await expect.poll(() => countDealCardsForRelationship(), { timeout: 15000 }).toBe(2)
})

test('a c2c-chat-created deal lands in the recipient\'s c2c chat directly — no ticket, no claim (T01/HEL-63 premise reversed)', async ({
  browser,
}) => {
  const { aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser)
  try {
    await createC2cDealAsAlice(alicePage)
    const cardId = resolveDealCardIdForRelationship()

    // ---- Bob's (the RECEIVING company's) Deal-tickets lens shows nothing new ----
    // There is no ticket to find any more (T01 deleted send_deal's call to
    // deliver_deal on this arm), so the ONLY correct state is the lens's
    // positive empty-state string — asserted AFTER load finishes, never
    // before (an absence taken on a loading page passes just as readily as on
    // an empty one).
    await bobPage.goto('/connect/inbox')
    await expect(bobPage.getByText('Loading inbox…')).toBeHidden({ timeout: 15000 })
    await bobPage.getByRole('button', { name: /deal tickets/i }).click()
    await expect(
      bobPage.getByText('No deal tickets waiting to be picked up.', { exact: false }),
    ).toBeVisible({ timeout: 15000 })
    await expect(bobPage.getByText('Pedanios 31/1 COS-CA')).toHaveCount(0)
    // the row fact behind the UI check above: zero pending_inbox_item rows for
    // this card (T01 AC 2 / M2).
    expect(countTicketsForCard(cardId)).toBe(0)

    // ---- the pill is in BOB's OWN c2c chat already — no claim needed to reach it ----
    await openC2cChat(bobPage, COUNTERPARTY_NAME.bob)
    const pill = bobPage.getByRole('button', { name: /click to open the deal card/i }).first()
    await expect(pill).toBeVisible({ timeout: 15000 })
    await pill.click()
    await dealPanel(bobPage)
      .getByRole('button', { name: /talk about this deal/i })
      .waitFor({ timeout: 15000 })
    // the pill is in c2c, and (this file's OTHER creation door — the c2c chat,
    // not the basket) never touched p2p at all.
    expect(countDealPillsOnThread('c2c')).toBe(1)
    expect(countDealPillsOnThread('p2p')).toBe(0)

    // ---- no claim happened: the creator is still the SOLE deal_member ----
    // (ADR 0006 §4.1:307 carries the safety analysis for a company-wide-born
    // workspace staying reachable with one owner — cited, not re-derived here.)
    expect(countDealMembersForCard(cardId)).toBe(1)
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
