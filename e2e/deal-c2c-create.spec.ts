/**
 * Lane A — deal creation from the c2c (company) chat + the company-delivery
 * spine (birth → inbox ticket → claim).
 *
 * Before this lane the c2c chat rendered DealPin's State A as just "No deal
 * yet": the "Start a deal" button + the `hs:create-deal` listener were gated on
 * `canPropose = variant === "chat" && !!threadId`, and ThreadView passes
 * `threadId: undefined` for a c2c conversation — so a company chat offered no
 * way to create a deal, and a born deal had no visible c2c surface.
 *
 * What this file proves, in order:
 *   1. the c2c chat offers "Start a deal"; the birth has the CREATOR AS SOLE
 *      OWNER (no counterparty person exists in a company chat — that absence
 *      is deliver_deal's company-target routing key);
 *   2. the born deal's row appears in the c2c chat LIVE (hs:deal-updated —
 *      the c2c strip has no p2p thread, so realtime never covers it);
 *   3. the row survives a fresh navigation and opens the card panel;
 *   4. the full company delivery: the ticket lands in the OTHER company's
 *      "Deal tickets" inbox lens with a real card preview, "Accept & connect"
 *      makes the claimer a deal_member owner on the SAME deal (no new
 *      relationship), and the deal then opens from the claimer's own c2c chat.
 *
 * Selectors mirror fixtures/two-company.ts (createC2cDealAsAlice drives the
 * create flow; the panel is `<aside aria-label="Deal card">`).
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
  // deal_member owner (this absence is deliver_deal's company-target routing key)
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
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row = dealPanel(page)
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: /done editing this line/i }) })
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('7.50')
  await dealPanel(page).getByRole('button', { name: /^send deal$/i }).click()
  // BORN-card-only signal (the create card also shows "Talk about this deal")
  await dealPanel(page).getByRole('button', { name: /edit deal/i }).waitFor({ timeout: 15000 })

  // a genuinely NEW card was born (not an edit of the first)
  await expect.poll(() => countDealCardsForRelationship(), { timeout: 15000 }).toBe(2)
})

test('the ticket lands in the other company\'s Deal tickets lens; accepting joins the deal', async ({
  browser,
}) => {
  const { aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser)
  try {
    await createC2cDealAsAlice(alicePage)
    const cardId = resolveDealCardIdForRelationship()

    // NEGATIVE SPACE: the ticket row is visible to both companies at the DB
    // layer (inbox select RLS is deliberately two-sided), but only the RECEIVER
    // can act — so the SENDER's inbox must offer it in NO actionable lens.
    await alicePage.goto('/connect/inbox')
    // wait for the queue to actually load (also guarantees hydration) before
    // driving the tabs — a click during load lands on a handler-less button
    await expect(alicePage.getByText('Loading inbox…')).toBeHidden({ timeout: 15000 })
    // default lens (Unassigned): her outgoing ticket must not be listed
    await expect(alicePage.getByText('Pedanios 31/1 COS-CA')).toHaveCount(0)
    await alicePage.getByRole('button', { name: /deal tickets/i }).click()
    await expect(
      alicePage.getByText('No deal tickets waiting to be picked up.', { exact: false }),
    ).toBeVisible({ timeout: 15000 })

    // Bob (StonePharm) finds the claimable ticket under its OWN lens, with the
    // real card preview (deterministic Pedanios line from the create fixture)
    await bobPage.goto('/connect/inbox')
    await bobPage.getByRole('button', { name: /deal tickets/i }).click()
    const ticketRow = bobPage.getByText('Pedanios 31/1 COS-CA', { exact: false }).first()
    await expect(ticketRow).toBeVisible({ timeout: 15000 })
    await ticketRow.click()

    // Accept = claim (the button is deal-worded — nothing is being "connected"):
    // Bob becomes a deal_member OWNER on the SAME deal
    await bobPage.getByRole('button', { name: /pick up deal/i }).first().click()
    await expect
      .poll(() => countDealMembersForCard(cardId), { timeout: 15000 })
      .toBe(2)

    // …and NO new relationship was minted: the deal opens from the EXISTING
    // GreenLeaf c2c chat on Bob's side.
    await openC2cChat(bobPage, COUNTERPARTY_NAME.bob)
    const openCard = bobPage.getByRole('button', { name: 'Open the deal card', exact: true })
    await expect(openCard.first()).toBeVisible({ timeout: 15000 })
    await openCard.first().click()
    await dealPanel(bobPage)
      .getByRole('button', { name: /talk about this deal/i })
      .waitFor({ timeout: 15000 })
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
