/**
 * A1 — deal creation from the c2c (company) chat.
 *
 * Today the c2c chat renders DealPin's State A as just "No deal yet": the
 * "Start a deal" button + the `hs:create-deal` listener are gated on
 * `canPropose = variant === "chat" && !!threadId`, and ThreadView passes
 * `threadId: undefined` for a c2c conversation. So a company chat offers no
 * way to create a deal, and a deal born on the relationship has no visible
 * surface in the c2c chat (the picker + open-card chip live inside the
 * threadId-gated p2p top bar).
 *
 * This spec drives the WANTED behaviour (Lane A / A1):
 *   1. the c2c chat shows "Start a deal"; clicking it opens the create-mode
 *      card (same DealCardPanelHost panel the p2p door uses — DealPin knows the
 *      relationship, which is all `createDeal` needs);
 *   2. "Send deal" births a real draft with the CREATOR AS SOLE OWNER (no
 *      counterparty person exists in a company chat — that is the routing key
 *      A2's deliver_deal reads);
 *   3. after a re-open the c2c chat shows the born deal as its own row (chip +
 *      "Open the deal card"), which opens the card panel.
 *
 * p2p regression is covered by the existing deal-change suite (same button,
 * same panel) — not duplicated here.
 *
 * Selector notes (mirrors fixtures/two-company.ts):
 *   - the c2c conversation row is found by narrowing the list with the
 *     "Search conversations…" box, then clicking the one row whose subtitle is
 *     "Company chat (C2C)" (p2p rows subtitle the company name instead);
 *   - the create-mode card + the born card render inside
 *     `<aside aria-label="Deal card">`; "Talk about this deal" is the stable
 *     "real card is rendered" signal (present in every card state).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  loginAs,
  resetDealData,
  resolveDealCardIdForRelationship,
  countDealMembersForCard,
  dealPanel,
  openRowLocator,
  COUNTERPARTY_NAME,
} from './fixtures/two-company'

// One shared GreenLeaf <-> StonePharm relationship; each test mints/wipes the
// deal on it — never parallel within this file.
test.describe.configure({ mode: 'serial' })

/** Open the GreenLeaf <-> StonePharm COMPANY (c2c) chat as the current user. */
async function openC2cChat(page: Page): Promise<void> {
  await page.goto('/connect/chat')
  // narrow the list to StonePharm rows, then pick the one c2c row by its
  // fixed subtitle (the p2p row's subtitle is the company name, never this).
  await page.getByPlaceholder('Search conversations…').fill(COUNTERPARTY_NAME.alice)
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

  // A1 core: the company chat must offer deal creation (today: "No deal yet" only)
  const startButton = page.getByRole('button', { name: 'Start a deal', exact: true })
  await expect(startButton).toBeVisible()
  await startButton.click()

  // the SAME create-mode card the p2p door opens (DealCardPanelHost)
  const addProductSelect = dealPanel(page)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })

  const row = openRowLocator(page)
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('5.00')

  await dealPanel(page).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(page)
    .getByRole('button', { name: /talk about this deal/i })
    .waitFor({ timeout: 15000 })

  // no counterparty person exists in a company chat → the creator is the SOLE
  // deal_member owner (this absence is A2's company-target routing key).
  const cardId = resolveDealCardIdForRelationship()
  expect(countDealMembersForCard(cardId)).toBe(1)
})

test('a born deal shows as a c2c row that opens the card', async ({ page }) => {
  await loginAs(page, 'alice')
  await openC2cChat(page)

  // birth a draft from the c2c chat (as above, condensed)
  await page.getByRole('button', { name: 'Start a deal', exact: true }).click()
  const addProductSelect = dealPanel(page)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor()
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row = openRowLocator(page)
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('5.00')
  await dealPanel(page).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(page)
    .getByRole('button', { name: /talk about this deal/i })
    .waitFor({ timeout: 15000 })

  // fresh navigation (A1 needs no live refresh — that is A7): the c2c chat now
  // shows the born deal as its own row with the open-card control.
  await openC2cChat(page)
  const openCard = page.getByRole('button', { name: 'Open the deal card', exact: true })
  await expect(openCard.first()).toBeVisible({ timeout: 15000 })
  await openCard.first().click()
  await dealPanel(page)
    .getByRole('button', { name: /talk about this deal/i })
    .waitFor({ timeout: 15000 })
})
