/**
 * A5 — person delivery: a deal sent to a PERSON lands as a clickable
 * "[Sender] has sent a deal" message in that person's chat.
 *
 * The routing spine (deliver_deal) makes a birth WITH a counterparty co-owner
 * person-target: NO inbox ticket — the delivery is a chat_message of type
 * 'deal_card' posted by the SEND layer (the create-card host / basket send),
 * never by SQL (which would double-deliver the Sella-detection door) and never
 * by deals/ (module cycle).
 *
 * Drives the chat door end-to-end over the seeded Alice (GreenLeaf) ↔ Bob
 * (StonePharm) p2p thread:
 *   1. Alice births a draft from Bob's chat (the existing create-mode card) —
 *      the door now carries Bob as counterparty co-owner;
 *   2. the "has sent a deal" bubble appears in Alice's chat, and in Bob's;
 *   3. clicking the bubble opens the deal card in the side panel;
 *   4. DB: the born card has ZERO pending_inbox_item rows (person-target).
 *
 * NOT covered here (and why): the "no chat yet → a new p2p conversation opens"
 * arm rides openOrCreateP2pThread (existing, already exercised by the accept
 * flow); the "detection deals are not doubled" arm is proven at the SQL layer
 * by deliver_deal_test.sql (the send layer simply isn't in the detection path).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import {
  openTwoContexts,
  createDraftDealAsAlice,
  resetDealData,
  resolveDealCardIdForRelationship,
  countTicketsForCard,
  countDealCardsForRelationship,
  dealPanel,
  COUNTERPARTY_NAME,
  type Who,
} from './fixtures/two-company'

test.describe.configure({ mode: 'serial' })

let aliceContext: BrowserContext
let bobContext: BrowserContext
let alicePage: Page
let bobPage: Page

async function openP2pChat(page: Page, who: Who) {
  await page.goto('/connect/chat')
  await page.getByText(COUNTERPARTY_NAME[who], { exact: false }).first().click()
}

test.beforeEach(async ({ browser }) => {
  resetDealData()
  ;({ aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser))
})

test.afterEach(async () => {
  await aliceContext?.close()
  await bobContext?.close()
})

test('sending a deal from a p2p chat drops the clickable bubble on both sides, no inbox ticket', async () => {
  // Alice births from Bob's chat (the fixture drives the create-mode card door)
  await createDraftDealAsAlice(alicePage)

  // 1 · the sender's own chat shows the delivery bubble (the BUBBLE button —
  //     its accessible name carries the "Click to open…" hint line, which the
  //     conversation-list row's preview text never does)
  await expect(
    alicePage.getByRole('button', { name: /click to open the deal card/i }).first(),
  ).toBeVisible({ timeout: 15000 })

  // 2 · person-target birth → NO company inbox ticket
  const cardId = resolveDealCardIdForRelationship()
  expect(countTicketsForCard(cardId)).toBe(0)

  // 3 · the recipient sees the same bubble in his chat with Alice…
  await openP2pChat(bobPage, 'bob')
  const bobBubble = bobPage.getByRole('button', { name: /click to open the deal card/i }).first()
  await expect(bobBubble).toBeVisible({ timeout: 15000 })

  // 4 · …and clicking it opens the deal card in the side panel
  await bobBubble.click()
  await dealPanel(bobPage)
    .getByRole('button', { name: /talk about this deal/i })
    .waitFor({ timeout: 15000 })
})

test('declining a deal posts a system line in the chat (the WhatsApp-style activity signal)', async () => {
  await createDraftDealAsAlice(alicePage)

  // Bob opens the deal from his chat and DECLINES it
  await openP2pChat(bobPage, 'bob')
  await bobPage.getByRole('button', { name: /click to open the deal card/i }).first().click()
  // declining is a two-step confirm: the first click reveals "End this deal?",
  // the second (the row's own "Decline deal") actually runs declineDeal
  await dealPanel(bobPage).getByRole('button', { name: /decline deal/i }).click()
  await dealPanel(bobPage).getByRole('button', { name: /decline deal/i }).click()

  // the decline is not just a card-state change — it projects into the chat
  // stream as the SAME clickable pill every deal signal uses (one pattern,
  // Muskan's 2026-07-22 call), on BOTH sides (realtime insert)
  await expect(
    bobPage.getByRole('button', { name: /deal declined/i }).first(),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    alicePage.getByRole('button', { name: /deal declined/i }).first(),
  ).toBeVisible({ timeout: 15000 })
})

test('signing a deal posts a system line in the chat', async () => {
  await createDraftDealAsAlice(alicePage)

  // Bob (the responder — Alice sent the latest version) signs
  await openP2pChat(bobPage, 'bob')
  await bobPage.getByRole('button', { name: /click to open the deal card/i }).first().click()
  await dealPanel(bobPage).getByRole('button', { name: /sign the deal/i }).click()

  await expect(
    bobPage.getByRole('button', { name: /deal signed/i }).first(),
  ).toBeVisible({ timeout: 15000 })
  await expect(
    alicePage.getByRole('button', { name: /deal signed/i }).first(),
  ).toBeVisible({ timeout: 15000 })
})

test('a SECOND deal can be started from the same p2p chat — button visible, composer + door works', async () => {
  await createDraftDealAsAlice(alicePage)

  // a deal exists — the strip must STILL offer "Start a deal" (Muskan's call,
  // 2026-07-20: a chat hosts many deals; the first birth must not hide the door)
  await expect(
    alicePage.getByRole('button', { name: 'Start a deal', exact: true }),
  ).toBeVisible({ timeout: 10000 })

  // drive the SECOND create through the composer's "+" door (the other entry
  // point that must keep working once deals exist)
  await alicePage.getByRole('button', { name: 'Add', exact: true }).click()
  await alicePage.getByRole('button', { name: /create a deal/i }).click()
  const addProductSelect = dealPanel(alicePage)
    .locator('select')
    .filter({ hasText: /add product from your shop/i })
  await addProductSelect.waitFor({ timeout: 15000 })
  await addProductSelect.selectOption({ label: 'Pedanios 31/1 COS-CA' })
  const row = dealPanel(alicePage)
    .getByRole('row')
    .filter({ has: alicePage.getByRole('button', { name: /done editing this line/i }) })
  await row.locator('select').nth(2).selectOption('100')
  await row.locator('input[type="number"]').fill('7.50')
  await dealPanel(alicePage).getByRole('button', { name: /^send deal$/i }).click()
  await dealPanel(alicePage).getByRole('button', { name: /edit deal/i }).waitFor({ timeout: 15000 })

  // a genuinely NEW card (2 on the relationship), person-target like the first
  await expect.poll(() => countDealCardsForRelationship(), { timeout: 15000 }).toBe(2)
})
