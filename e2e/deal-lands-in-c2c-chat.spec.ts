/**
 * 0023-deal-draft-lands-in-chat · T03 / HEL-65 — the buyer walk, end to end.
 * Full rationale: docs/muskan-build/0023-deal-draft-lands-in-chat/PLAN-T03.md.
 *
 * TICKETS.md criteria proven here (T03 has five; PLAN-T03 §3 adds a sixth by
 * ruling — T02's G4 handed the call-site-wiring gap to this ticket, L-051):
 *
 *   AC 1 — the pill appears in the seller's c2c conversation, and the deal
 *          opens from it .......................................... test 2
 *   AC 2 — the recipient reaches it without visiting /connect/inbox ... IMPLIED
 *          by AC 1 + AC 3 together, not separately asserted (`plan-checker`
 *          N6 — a script proves nothing by omission; what proves it is the
 *          pair "reachable from chat" + "absent from the inbox lens")
 *   AC 3 — the Deal-tickets lens shows no NEW entry (pre-existing production
 *          tickets are allowed to survive — this is "no new", not "empty") .. test 2
 *   AC 6 — the addressee control's CALL SITE is wired correctly, not just its
 *          selector (T02 G4 ruling 2 / critic N1) ......................... test 1
 *
 * AC 4 (deal-c2c-create.spec.ts's premise reversed) and AC 5 (inbox-accept.spec.ts
 * run deliberately) are proven in OTHER files — see deal-c2c-create.spec.ts's
 * header and PLAN-T03 §4 step 7 for the full run set.
 *
 * THE ONE PROPERTY THIS FILE EXISTS TO HOLD (plan-checker's own charge): test 1
 * must go RED if BasketDrawer.tsx:361 read `relationshipId={group.sellerCompanyId}`
 * instead of `group.relationshipId` — both are `string`, both compile, and
 * T02's seven unit cases stay green under that swap (L-050). Asserting "the
 * control renders" or "Whole company is the default" does NOT discriminate;
 * only asserting the NAMED people (Alice Green, Carla Klein) does, because
 * `peopleForRelationship` keyed on the wrong id returns `[]`.
 *
 * Fixture: one throwaway GreenLeaf product this file mints and hard-deletes
 * itself (L-033 — AUR-1A..1F are each pinned by a pgTAP matrix cell or another
 * e2e spec's mutation; a fresh row has no dependents by construction). Mirrors
 * discover-shop.spec.ts's T07 fixture almost exactly (same seller, same
 * pricelist, same location) — see that file's :662-716 for the precedent this
 * one was checked against.
 *   - location "Toronto Warehouse": MUST be an existing GreenLeaf location.
 *     discover-shop.spec.ts (sorts AFTER this file under one worker) asserts
 *     the buyer sees EXACTLY 3 `location-option`s on GreenLeaf's shop; a new
 *     location string would make that 4.
 *   - pack_size_grams 100: without it `resolveBasketLine` yields `grams ==
 *     null` and `toDraftLines` falls back to a raw pack count instead of
 *     grams — a different born line than this walk describes.
 *   - teardown order: `resetDealData()` FIRST. `deal_line_item.product_id`
 *     has no `ON DELETE` action, and test 2 births a real draft against this
 *     product — deleting the product before the deal data would raise 23503
 *     and leak this fixture into the seed permanently. Every delete below
 *     checks its own error rather than firing and forgetting.
 *
 * One worker, file order is path order (playwright.config.ts:26) — this file
 * sorts between deal-change.spec.ts and deal-p2p-send.spec.ts. Its OWN
 * `beforeEach(resetDealData)` is what makes every count in test 2 absolute
 * rather than relative to whatever a previous file's last test left behind.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from './fixtures/local-supabase'
import {
  loginAs,
  openTwoContexts,
  resetDealData,
  resolveDealCardIdForRelationship,
  countTicketsForCard,
  countDealPillsOnThread,
  dealPanel,
} from './fixtures/two-company'

test.describe.configure({ mode: 'serial' })

const GREENLEAF_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const GREENLEAF_PRICELIST_ID = '3fe179d5-c0e7-4eff-9726-f707c04572f9'
const PRODUCT_NAME = 'T03 Chat Landing Product'
const PRODUCT_CODE = 'T03-TMP'

function makeAdminClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

let productId: string | null = null

test.beforeAll(async () => {
  const admin = makeAdminClient()
  const { data: product, error: productErr } = await admin
    .from('product')
    .insert({
      company_id: GREENLEAF_ID,
      name: PRODUCT_NAME,
      supplier_product_code: PRODUCT_CODE,
      profile_visible: true,
      price_public: true,
      location: 'Toronto Warehouse',
      pack_size_grams: 100,
    })
    .select('id')
    .single()
  if (productErr || !product) {
    throw new Error(`T03 fixture: product insert failed — ${productErr?.message}`)
  }
  productId = (product as { id: string }).id

  const { error: priceErr } = await admin.from('pricelist_item').insert({
    pricelist_id: GREENLEAF_PRICELIST_ID,
    product_id: productId,
    price_per_gram: 5.0,
    currency: 'EUR',
  })
  if (priceErr) {
    throw new Error(`T03 fixture: pricelist_item insert failed — ${priceErr.message}`)
  }
})

test.beforeEach(() => {
  resetDealData()
})

test.afterAll(async () => {
  if (!productId) return
  // resetDealData() FIRST — see the module header's teardown-order note (B1).
  resetDealData()
  const admin = makeAdminClient()
  const { error: lineErr } = await admin
    .from('product_basket_line')
    .delete()
    .eq('product_id', productId)
  if (lineErr) {
    throw new Error(`T03 fixture teardown: product_basket_line delete failed — ${lineErr.message}`)
  }
  const { error: priceErr } = await admin.from('pricelist_item').delete().eq('product_id', productId)
  if (priceErr) {
    throw new Error(`T03 fixture teardown: pricelist_item delete failed — ${priceErr.message}`)
  }
  const { error: prodErr } = await admin.from('product').delete().eq('id', productId)
  if (prodErr) {
    throw new Error(`T03 fixture teardown: product delete failed — ${prodErr.message}`)
  }
})

/**
 * Add the fixture product to `page`'s basket and open the drawer. Returns the
 * `role="menu"` panel locator with the GreenLeaf group already confirmed
 * visible — a positive anchor before either test drives the group further
 * (L-021: presence before absence, and before anything more specific).
 */
async function addFixtureAndOpenBasket(page: Page): Promise<Locator> {
  await page.goto(`/discover/${GREENLEAF_ID}`)
  const card = page.getByTestId('product-card').filter({ hasText: PRODUCT_NAME })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: /add to basket/i }).click()

  await page.getByRole('button', { name: 'Basket', exact: true }).click()
  const basket = page.getByRole('menu', { name: 'Your basket' })
  await expect(basket.getByText('GreenLeaf Cultivation', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  return basket
}

test('the buyer\'s addressee control offers named GreenLeaf people, not just the default (AC 6 — call-site wiring)', async ({
  page,
}) => {
  await loginAs(page, 'bob')
  const basket = await addFixtureAndOpenBasket(page)

  const select = basket.getByLabel('Address this deal to')
  await expect(select).toBeVisible()

  // "Whole company" is always option 0 (T02's J6 default) — the one thing safe
  // to assert positionally. Option ORDER beyond that is unstable between loads
  // (T02 G4 observation 1), so everything else is a membership check, never an
  // index.
  const options = select.locator('option')
  await expect(options.first()).toHaveText('Whole company')

  // THE DISCRIMINATING ASSERTION. `getMyConnections()` arrives after first
  // paint (CounterpartyPersonSelect.tsx:83-96), so this must be an
  // auto-retrying matcher — a one-shot `allTextContents()` would race the
  // fetch and read `['Whole company']` on a correct implementation too
  // (plan-checker N1). And it must name the PEOPLE, not just "the control
  // rendered": under the swapped-call-site bug (`relationshipId=
  // {group.sellerCompanyId}`) the select still renders, still defaults to
  // "Whole company", and `tsc` and all seven T02 unit cases stay green — only
  // the missing names expose it (L-050).
  await expect(select).toContainText('Alice Green')
  await expect(select).toContainText('Carla Klein')
})

test('a company-addressed deal lands as a pill in the seller\'s c2c chat, opens from it, and mints no new deal ticket (AC 1, AC 3; AC 2 implied)', async ({
  browser,
}) => {
  const { aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser)
  try {
    const basket = await addFixtureAndOpenBasket(bobPage)

    // the addressee is left at its default, "Whole company" (T02 AC1) — this
    // walk never touches the select.
    await basket.getByRole('button', { name: /^create a draft deal$/i }).click()

    // the born card panel — the DecisionBar's "Send deal" button is the
    // unsent-status-only signal (mirrors createDraftDealAsAlice's own wait).
    await dealPanel(bobPage).getByRole('button', { name: /^send deal$/i }).waitFor({
      timeout: 15000,
    })
    // B2: this test's beforeEach reset the relationship and this is the ONLY
    // card born on it since — `resolveDealCardIdForRelationship`'s `limit 1`
    // (no ORDER BY) is unambiguous here. Captured now, right after birth, "on
    // the reset state" (PLAN-T03 §4 step 4).
    const cardId = resolveDealCardIdForRelationship()

    await dealPanel(bobPage).getByRole('button', { name: /^send deal$/i }).click()
    await dealPanel(bobPage).getByText(/waiting for the other side to sign/i).waitFor({
      timeout: 15000,
    })

    // ---- AC 1: the pill lands in the SELLER's (Alice/GreenLeaf) c2c chat ----
    await alicePage.goto('/connect/chat')
    await alicePage.getByPlaceholder('Search conversations…').fill('StonePharm')
    await alicePage.getByText('Company chat (C2C)', { exact: true }).first().click()

    // the repo idiom names the pill by its trailing caption, never the loose
    // "Open the deal card" (that name ALSO matches the strip's own icon
    // button — a selector collision named in PLAN-T03 §6.4). Precedent:
    // deal-p2p-send.spec.ts:69.
    const pill = alicePage.getByRole('button', { name: /click to open the deal card/i }).first()
    await expect(pill).toBeVisible({ timeout: 15000 })
    // the field the code writes (send_deal's v_name, from person.first_name /
    // last_name), not a label read off a screenshot (L-020). Bob is the
    // sender — he is the buyer who addressed the deal to "Whole company".
    await expect(pill).toContainText('Bob Stone has sent a deal')

    await pill.click()
    await dealPanel(alicePage).getByRole('button', { name: /talk about this deal/i }).waitFor({
      timeout: 15000,
    })

    // ---- negative space, all on this ONE state (L-021: presence AND absence together) ----
    // the authoritative half — card-scoped, so it is immune to whatever
    // pre-existing production tickets AC 3 says are allowed to survive.
    expect(countTicketsForCard(cardId)).toBe(0)
    // the row fact: the pill is in c2c, and NOT in p2p (L-019 — prove the row;
    // this is not otherwise checkable in one state, since the UI only shows
    // one thread at a time).
    expect(countDealPillsOnThread('c2c')).toBe(1)
    expect(countDealPillsOnThread('p2p')).toBe(0)

    // ---- AC 3 (AC 2 implied by this + AC 1 above): no NEW Deal-tickets entry ----
    await alicePage.goto('/connect/inbox')
    // B4: LensTabs renders UNCONDITIONALLY, above the loading ternary
    // (InboxView.tsx:130-131) — an absence assertion taken before load
    // finishes would pass on a loading page, a blank page, or a crashed
    // InboxView just as readily as on a correct one. Copies the shape already
    // in deal-c2c-create.spec.ts (:152-161): wait for load, assert the
    // POSITIVE empty-state string, THEN the absence.
    await expect(alicePage.getByText('Loading inbox…')).toBeHidden({ timeout: 15000 })
    await alicePage.getByRole('button', { name: /deal tickets/i }).click()
    await expect(
      alicePage.getByText('No deal tickets waiting to be picked up.', { exact: false }),
    ).toBeVisible({ timeout: 15000 })
    await expect(alicePage.getByText(PRODUCT_NAME)).toHaveCount(0)
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
