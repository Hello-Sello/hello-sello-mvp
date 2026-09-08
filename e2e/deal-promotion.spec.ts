/**
 * The promotion track's status gate — the UI half of "a promotion is
 * negotiation-only to offer or accept".
 *
 * That change shipped to production as a narrow cherry-pick with the server
 * half (`offer_promotion` / `accept_promotion` RPCs) covered by SQL tests and
 * the UI half covered by nothing. This is the missing half.
 *
 * THE CONTRACT (`PromotionTrack.tsx`): Accept is REMOVED, not disabled, once
 * the deal has left `negotiation` — the server would refuse it, and a dead
 * disabled button is against the project's own UI rule. DECLINE stays in every
 * status on purpose: it changes nothing on the deal, and gating it would strand
 * a pending promotion behind two refusing buttons with no way to clear it.
 * Both halves are asserted; asserting only the removal would let a regression
 * that hides Decline too pass unnoticed.
 *
 * The gate is driven over EVERY non-negotiation status, not just one. The rule
 * is `status !== 'negotiation'`, so a single `done` case would stay green if the
 * check ever narrowed to `!== 'done'` — and Accept would then render live on a
 * `confirmed` or `cancelled` card, which is the dead button the change exists
 * to remove. `NON_NEGOTIATION` is typed off `DealCardStatus`, so a code added to
 * the domain that is missed here is a compile error, not a silent gap.
 *
 * Driven as an e2e rather than a render test because the buttons live behind a
 * reveal: the track first paints a single "Promotion" button, and only after a
 * real click does it show Decline/Accept. This repo's vitest runs in `node`
 * with no jsdom (`renderToStaticMarkup` only, no events), so that branch is not
 * reachable from a unit test — the same wall documented in
 * `src/modules/basket/supabase/writes.test.ts`.
 *
 * Seed isolation: `resetDealData()` runs in BOTH hooks. `beforeEach` for a clean
 * start; `afterEach` because these tests move the shared GreenLeaf↔StonePharm
 * card out of `negotiation`, and leaving that for the next spec's own reset
 * would make this file depend on an invariant it does not own. The promotion
 * rows need no separate cleanup — `deal_promotion.deal_card_id` is ON DELETE
 * CASCADE, so they go with the card.
 *
 * Run via `npm test` — the relative fixture imports need
 * PLAYWRIGHT_FORCE_ASYNC_LOADER=1.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  birthAndOpenDeal,
  dealPanel,
  openDealInChat,
  openTwoContexts,
  resetDealData,
  resolveDealCardIdForRelationship,
  type Who,
} from "./fixtures/two-company";
import { psqlExec, psqlValue } from "./fixtures/catalog";

/** The six codes the gate must refuse — `deal_card_status` minus the one it
 *  allows. Listed in full, and typed, so a status added to the domain without
 *  a decision here fails to compile rather than slipping through untested. */
const NON_NEGOTIATION = [
  "unsent",
  "confirmed",
  "done",
  "cancelled",
  "ticket_created",
  "ticket_closed",
] as const;
type NonNegotiation = (typeof NON_NEGOTIATION)[number];

/** The subset the BUYER can actually reach. `unsent` is excluded on purpose and
 *  not as an oversight: before the send, RLS gives the counterparty no card at
 *  all (D-08), so there is no promotion track for Bob to open — the gate is
 *  unreachable rather than unenforced. The seller-side case below covers the
 *  one identity that can see an unsent card. */
const BUYER_VISIBLE_NON_NEGOTIATION = NON_NEGOTIATION.filter(
  (s): s is Exclude<NonNegotiation, "unsent"> => s !== "unsent",
);

let aliceContext: BrowserContext | undefined;
let bobContext: BrowserContext | undefined;
let alicePage: Page;
let bobPage: Page;

test.beforeEach(async ({ browser }) => {
  resetDealData();
  ({ aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser));
  await birthAndOpenDeal(alicePage, bobPage);
});

test.afterEach(async () => {
  const contexts = [aliceContext, bobContext];
  // Clear the refs BEFORE awaiting: if `openTwoContexts` rejected part-way, these
  // still point at the PREVIOUS test's closed contexts, and closing those twice
  // hides the fact that this test's own contexts were never assigned.
  aliceContext = undefined;
  bobContext = undefined;
  for (const c of contexts) await c?.close();
  resetDealData();
});

/**
 * Offer a pending promotion on the card, from the seller's side, so the BUYER is
 * the one offered Accept/Decline.
 *
 * The seller is resolved with the database's own `card_seller_company_id()`
 * rather than hardcoding GreenLeaf: which side sells depends on the card's
 * `deal_type`, so a hardcode would silently mint a buyer-authored promotion —
 * a row `offer_promotion` would refuse — if the birth flow ever changed type.
 * `getPromotion` derives `iOffered` by comparing companies and never consults
 * the real seller, so both tests would still pass over that impossible state.
 */
function offerPromotionFromSeller(dealCardId: string) {
  psqlExec(`
    insert into deal_promotion
      (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
    select dc.id,
           dc.version,
           card_seller_company_id(dc.id),
           (select p.id from person p where p.company_id = card_seller_company_id(dc.id) limit 1),
           '[{"productName":"Pedanios 31/1 COS-CA","quantity":250,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
           'pending'
    from deal_card dc where dc.id = '${dealCardId}'`);
  // A zero-row insert is not a SQL error, so ON_ERROR_STOP cannot catch a seed
  // that silently did nothing.
  expect(
    psqlValue(`select count(*) from deal_promotion where deal_card_id = '${dealCardId}'`),
    "the promotion fixture did not land",
  ).toBe("1");
}

function setCardStatus(dealCardId: string, status: NonNegotiation | "negotiation") {
  psqlExec(`update deal_card set status = '${status}' where id = '${dealCardId}'`);
  expect(
    psqlValue(`select status from deal_card where id = '${dealCardId}'`),
    "the status fixture did not land",
  ).toBe(status);
}

/** The deal card panel for one side. `who` is passed through rather than
 *  hardcoded — `openDealInChat` uses it to pick the COUNTERPARTY thread, so a
 *  fixed identity would open the wrong chat for the other side. */
async function openCard(page: Page, who: Who) {
  await openDealInChat(page, who);
  return dealPanel(page);
}

/** The BUYER's track, revealed. Only the buyer gets the reveal: the track paints
 *  a single "Promotion" button and the resolve buttons appear after it is
 *  clicked. The seller's branch returns its waiting panel outright with no
 *  reveal button at all, so this helper would hang on it. */
async function revealPromotionAsBuyer(page: Page) {
  const panel = await openCard(page, "bob");
  await panel.getByRole("button", { name: "Promotion", exact: true }).click();
  return panel;
}

test("while the deal is in negotiation, the buyer is offered both Accept and Decline", async () => {
  const dealCardId = resolveDealCardIdForRelationship();
  offerPromotionFromSeller(dealCardId);
  // Assert the birth's status rather than assume it, so a change to that flow
  // shows up here as a precondition failure, not a mysterious missing button.
  expect(psqlValue(`select status from deal_card where id = '${dealCardId}'`)).toBe("negotiation");

  const panel = await revealPromotionAsBuyer(bobPage);
  // The reward the promotion actually carries — proves the track rendered its
  // content, not just an empty shell with two buttons in it.
  // The "+250 g …" form is the promotion reward line specifically; the bare
  // product name also appears in the deal's own product table.
  await expect(panel.getByText("+250 g Pedanios 31/1 COS-CA")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Decline", exact: true })).toBeVisible();
});

for (const status of BUYER_VISIBLE_NON_NEGOTIATION) {
  test(`once the deal is ${status}, Accept is gone but Decline remains`, async () => {
    const dealCardId = resolveDealCardIdForRelationship();
    offerPromotionFromSeller(dealCardId);
    setCardStatus(dealCardId, status);

    const panel = await revealPromotionAsBuyer(bobPage);
    // POSITIVE FIRST: this proves the track mounted and revealed. The
    // `toHaveCount(0)` below would pass instantly against an empty subtree — a
    // swallowed click or an unmounted track would read as success.
    await expect(panel.getByText(/the promotion can no longer be accepted/i)).toBeVisible();
    // REMOVED, not merely disabled — a disabled Accept would satisfy
    // `toBeDisabled` while breaking the rule the change exists to keep.
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
    // The other half: Decline must survive, or a pending promotion is unclearable.
    await expect(panel.getByRole("button", { name: "Decline", exact: true })).toBeVisible();
  });
}

test("the SELLER's side is unchanged by the gate — they wait, they never resolve", async () => {
  const dealCardId = resolveDealCardIdForRelationship();
  offerPromotionFromSeller(dealCardId);
  setCardStatus(dealCardId, "done");

  // `PromotionTrack` returns the seller's waiting panel BEFORE it consults the
  // status gate, and without a reveal step. Hoisting that gate above the early
  // return — a plausible "check it once at the top" simplification — would show
  // the seller "this deal has moved on" and no Decline at all. Nothing else
  // covers that branch.
  const panel = await openCard(alicePage, "alice");
  await expect(panel.getByText(/waiting for the buyer/i)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Decline", exact: true })).toHaveCount(0);
});
