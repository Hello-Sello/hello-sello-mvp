/**
 * DEV-83 — accepting a request from an ALREADY-CONNECTED company.
 *
 * The bug: `acceptInbox` deduped on `relationship.inbox_item_id`, a column
 * nothing enforces, and then INSERTed. The schema declares the real rules —
 * `uq_relationship_pair_active` (one live relationship per company pair),
 * `uq_chat_thread_c2c`, `uq_chat_thread_p2p` — so whenever the two companies
 * were already connected the insert raised `23505`, the transaction rolled
 * back, and BOTH call sites swallowed the throw (`InboxView.tsx:137`
 * `void refreshWith(...)`, `RequestsSection.tsx:98` try/finally with no catch).
 * The seller clicked Accept, nothing happened, no error appeared, and the item
 * stayed `pending` forever — on Marcel's demo path.
 *
 * Scope is wider than the seed: this hit ANY second substantive accept between
 * two already-connected companies. The seeded GreenLeaf <-> StonePharm
 * relationship (seed.sql:308-323, `inbox_item_id` NULL) is simply the shortest
 * walk to it.
 *
 * Identities (grepped from supabase/seed/seed.sql, not assumed — LEARNINGS
 * L-012): Alice = alice@greenleaf.test, GreenLeaf Cultivation, the SELLER whose
 * inbox receives the ask. Bob = bob@stonepharm.test, StonePharm, seeded
 * CONNECTED + verified to GreenLeaf. AUR-1A 'Pedanios 31/1 COS-CA' is
 * profile_visible with price_public=false — the one card that offers
 * Request pricing (T04).
 *
 * Two browser CONTEXTS, not two tabs (`openTwoContexts`): `proxy.ts` redirects
 * a signed-in user away from `/login` and `e2e/` has no sign-out helper, so an
 * in-page identity switch would hang. That is the trap that killed T04's
 * seller-side design; separate contexts sidestep it.
 *
 * Outcomes are asserted in SQL rather than off Alice's screen: the failure mode
 * under test is a SILENT one, and a UI that shows nothing on success looks
 * identical to a UI that shows nothing on a rolled-back transaction.
 */
import { test, expect } from "@playwright/test";
import {
  openTwoContexts,
  countActiveRelationshipsForPair,
  countConnectionEstablishedLines,
  countPersonRequestsForAlice,
  countThreadsForPair,
  pricingRequestStatus,
  resetPricingRequests,
} from "./fixtures/two-company";

const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// Leave the DB as the seed left it. `seed.sql` creates NO `pricelist_request`
// rows - every one is test residue - and this file is the only place that
// ACCEPTS one, which is the state `discover-shop.spec.ts` does not expect on a
// re-run without a `db reset`. Teardown, not setup, is what makes the suite
// repeatable; the setup call inside the test stays, so this file is also
// robust to whatever ran before it.
test.afterEach(() => {
  resetPricingRequests();
});
const PRODUCT = "Pedanios 31/1 COS-CA";

/**
 * The company inbox must render even though `pending_inbox_item` carries a type
 * it does not handle.
 *
 * `connect_person` (person-to-person, answered on Discover) shipped with the
 * Discover person graph. `InboxRow.tsx:26` and `InboxDetail.tsx:72` both read
 * `REQUEST_TYPE_META[item.type].icon`, and the connect module's
 * `InboxRequestType` union never gained the code - so the lookup returned
 * `undefined` and threw "Cannot read properties of undefined (reading 'icon')",
 * replacing the whole page with the error boundary. `getInbox` applied no type
 * filter, so ONE such row was enough. The seed plants exactly one (Clara ->
 * Alice), so every clean `db reset` reproduced it, and production had a live
 * row too.
 *
 * This test runs FIRST because the accept test below cannot even reach its
 * button while the inbox is blank.
 */
test("a pending person request neither reaches nor blanks the company inbox", async ({
  browser,
}) => {
  // vacuity guard: with no such row the assertions below prove nothing
  expect(countPersonRequestsForAlice()).toBeGreaterThanOrEqual(1);

  const { aliceContext, bobContext, alicePage } = await openTwoContexts(browser);
  await alicePage.goto("/connect/inbox");

  // the page RENDERS - this is the assertion the crash failed
  // Wait for a real ROW, not for the tab bar: `LensTabs` renders immediately
  // while `getInbox()` is still in flight, so asserting on chrome (or on the
  // absence of the error text) passes in the window BEFORE the crashing row
  // arrives. Bavaria's seeded `connect` is a company-inbox type that must
  // always be listed - its presence is what proves the list actually rendered.
  await expect(
    alicePage.getByText(/Bavaria Medical Cannabis/i).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(alicePage.getByText(/this page couldn.t load/i)).toHaveCount(0);

  // ...and the person request is not listed here: it belongs to Discover's
  // Requests section, which has the accept/decline path this surface lacks.
  // Same trap on this lens - assert a row that MUST be there before concluding
  // anything from a row that must not, or the error boundary reads as "absent".
  await alicePage.getByRole("button", { name: /^All \d+$/ }).click();
  await expect(
    alicePage.getByText(/NordCanna Distribution/i).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(alicePage.getByText(/Clara Vogt/i)).toHaveCount(0);
  await expect(alicePage.getByText(/Rheinland Apotheke/i)).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});

test("a connected buyer's pricing ask can be accepted: the relationship is adopted, not re-minted", async ({
  browser,
}) => {
  // own the setup: a previous run's ask is still `accepted`, and T04's
  // per-product dup-guard would refuse to create a second one
  resetPricingRequests();

  const { aliceContext, bobContext, alicePage, bobPage } =
    await openTwoContexts(browser);

  // The state that makes this test meaningful — if the pair were NOT already
  // connected the accept would take the mint path and prove nothing.
  const relationshipsBefore = countActiveRelationshipsForPair();
  expect(relationshipsBefore).toBe(1);
  const c2cLinesBefore = countConnectionEstablishedLines();

  // 1) Bob, already connected, asks about a price-hidden product (T04's wire).
  await bobPage.goto(`/discover/${GREENLEAF_ID}`);
  const card = bobPage.getByTestId("product-card").filter({ hasText: PRODUCT });
  await expect(card).toBeVisible();
  await card.getByTestId("request-pricing").click();
  await expect(card.getByText(/pricing requested/i)).toBeVisible({
    timeout: 15000,
  });
  expect(pricingRequestStatus("StonePharm", "AUR-1A")).toBe("pending");

  // 2) Alice accepts it from her inbox. The ask arrives unassigned, so the
  //    row must be selected before the detail pane offers its buttons.
  await alicePage.goto("/connect/inbox");
  await alicePage.getByText(/StonePharm/i).first().click();
  await alicePage.getByRole("button", { name: /accept & connect/i }).click();

  // 3) The accept LANDED. Before the fix this stayed 'pending' forever, which
  //    is the whole defect — the button reported success by saying nothing.
  await expect
    .poll(() => pricingRequestStatus("StonePharm", "AUR-1A"), {
      timeout: 15000,
    })
    .toBe("accepted");

  // 4) It adopted the existing relationship instead of minting a second one.
  expect(countActiveRelationshipsForPair()).toBe(1);

  // 5) The C2C that already existed was reused, not duplicated — and the two
  //    companies were NOT told they are "now connected" a second time. Seed
  //    lines are written only for a thread the accept itself creates.
  expect(countThreadsForPair("c2c")).toBe(1);
  expect(countConnectionEstablishedLines()).toBe(c2cLinesBefore);

  // 6) A pricelist_request opens a P2P (rollout.ts `opensP2P`), and the pricing
  //    conversation needs one to happen in. Alice and Bob already share a P2P on
  //    the seeded relationship, so this is a FLOOR assertion — it proves the
  //    accept neither dropped the thread nor duplicated it (adoption must reuse
  //    it, and `uq_chat_thread_p2p` would reject a second) rather than proving
  //    this call created it. Creation on an adopted relationship is exercised
  //    wherever the two people do not yet share a thread.
  expect(countThreadsForPair("p2p")).toBe(1);

  await aliceContext.close();
  await bobContext.close();
});
