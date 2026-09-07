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
 * T09 (0027) correction: for pricing requests specifically, the DEV-83
 * regression this file was built to guard is now UNREACHABLE. T02 changed
 * `requestProductPricing` so an already-connected asker never mints a
 * `pending_inbox_item` at all — `is_connected_to_company` routes straight to
 * `request_product_pricing_c2c`, which posts a person-voiced chat message
 * directly to the existing c2c thread and cuts no ticket. There is no accept
 * step left in this path for DEV-83 to have broken. The general DEV-83
 * principle — that accepting a request onto an already-connected pair must
 * adopt the existing relationship rather than re-mint one — is no longer
 * retested here because that invariant now has independent SQL-level
 * coverage: `supabase/tests/connection_consent_lockdown_test.sql` and
 * `supabase/tests/accept_connection_request_status_guard_test.sql` both
 * prove it directly (no second thread, no duplicate "now connected"
 * message). Named, not silently dropped.
 *
 * The remaining test below proves T02's REPLACEMENT behaviour directly: a
 * connected buyer's pricing ask lands as a c2c chat message, mints no ticket,
 * and re-mints no relationship/thread — previously uncovered by any e2e test
 * (T02's own gate log flagged the gap).
 *
 * Identities (grepped from supabase/seed/seed.sql, not assumed — LEARNINGS
 * L-012): Alice = alice@greenleaf.test, GreenLeaf Cultivation, the SELLER.
 * Bob = bob@stonepharm.test, StonePharm, seeded CONNECTED + verified to
 * GreenLeaf. AUR-1A 'Pedanios 31/1 COS-CA' is profile_visible with
 * price_public=false — the one card that offers Request pricing (T04).
 *
 * Two browser CONTEXTS, not two tabs (`openTwoContexts`): `proxy.ts` redirects
 * a signed-in user away from `/login` and `e2e/` has no sign-out helper, so an
 * in-page identity switch would hang. That is the trap that killed T04's
 * seller-side design; separate contexts sidestep it.
 *
 * Outcomes are asserted in SQL rather than off Alice's screen: the write this
 * test proves is a company-to-company chat message, not a UI state only
 * visible from one particular screen — and DEV-83's original failure mode
 * (a UI showing nothing on success looking identical to a UI showing nothing
 * on a rolled-back transaction) is exactly why this suite never trusted the
 * UI alone for its outcome checks.
 */
import { test, expect } from "@playwright/test";
import {
  openTwoContexts,
  countActiveRelationshipsForPair,
  countConnectionEstablishedLines,
  countThreadsForPair,
  pricingRequestStatus,
  resetPricingRequests,
  resetPricingRequestMessage,
  countPricingRequestMessages,
} from "./fixtures/two-company";

const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// STALE-CORRECTED (T09, 0027): `resetPricingRequests()` used to clean up
// after the ONE place this file ACCEPTED a `pricelist_request`. That accept
// step is gone — Bob's ask below (an already-connected asker) never creates
// a `pricelist_request` row at all any more, it writes a c2c chat message
// instead. This call is now a defensive no-op for this file's OWN tests
// (nothing here mints a ticket-type row), kept only because a DIFFERENT spec
// running earlier in path order could still leave one behind.
// `resetPricingRequestMessage` (the new setup line in the test below) is this
// file's own equivalent for the message-layer row it creates instead — no
// afterEach teardown for that message: no spec after this one in path order
// reads c2c message counts, so leaving it live between runs is harmless
// today. Named explicitly rather than left to be rediscovered.
test.afterEach(() => {
  resetPricingRequests();
});
const PRODUCT = "Pedanios 31/1 COS-CA";

test("a connected buyer's pricing ask posts directly to the c2c chat — no ticket, nothing to accept (T02 replaces DEV-83's premise)", async ({
  browser,
}) => {
  // own the setup: a previous run's ask is still `accepted`, and T04's
  // per-product dup-guard would refuse to create a second one
  resetPricingRequests();
  // T09 (0027): the RPC's dedup guard on the c2c MESSAGE this ask now writes
  // is PERMANENT, scoped to (thread, sender's company, product), and nothing
  // else in e2e/ tears it down — without this reset a prior run of this test,
  // or discover-shop.spec.ts's own identical ask (StonePharm asking GreenLeaf
  // about AUR-1A, earlier in this suite's single-worker path order), would
  // make the assertions below pass on a message this test never sent.
  resetPricingRequestMessage("StonePharm", "AUR-1A");

  const { aliceContext, bobContext, alicePage, bobPage } =
    await openTwoContexts(browser);

  // The state that makes this test meaningful — if the pair were NOT already
  // connected the ask would take the ticket-mint path and prove nothing about
  // T02's connected-company path.
  const relationshipsBefore = countActiveRelationshipsForPair();
  expect(relationshipsBefore).toBe(1);
  const c2cLinesBefore = countConnectionEstablishedLines();

  // 1) Bob, already connected, asks about a price-hidden product (T04's wire).
  await bobPage.goto(`/discover/${GREENLEAF_ID}`);
  const card = bobPage.getByTestId("product-card").filter({ hasText: PRODUCT });
  await expect(card).toBeVisible();
  await card.getByTestId("request-pricing").click();
  // Both branches (the ticket-mint path for an unconnected asker, and the
  // message path for a connected one, T02) swap this button for the same
  // confirmation — it no longer discriminates connected vs. unconnected on
  // its own (satisfied equally by a real write or a silent dedup). The
  // DB-level checks below are what actually prove which branch fired.
  await expect(card.getByText(/pricing requested/i)).toBeVisible({
    timeout: 15000,
  });

  // 2) No ticket exists to have a status — the connected-company path never
  //    mints a pending_inbox_item at all (T02, 0027); there is no accept step
  //    left for DEV-83's regression to have broken.
  expect(pricingRequestStatus("StonePharm", "AUR-1A")).toBeNull();

  // 3) The message landed where a human would actually see it: Alice's side
  //    of the existing GreenLeaf <-> StonePharm c2c chat (no shared
  //    openC2cChat helper in this file — the idiom mirrors
  //    deal-c2c-create.spec.ts / deal-lands-in-c2c-chat.spec.ts).
  await alicePage.goto("/connect/chat");
  await alicePage.getByPlaceholder("Search conversations…").fill("StonePharm");
  await alicePage.getByText("Company chat (C2C)", { exact: true }).first().click();
  await expect(
    alicePage.getByText('Pricing request for "Pedanios 31/1 COS-CA".'),
  ).toBeVisible({ timeout: 15000 });

  // 4) The DB-level twin of the UI check above — exactly one live c2c
  //    pricing-ask message naming this product (this suite's own established
  //    double-proof idiom: a UI pill/text check paired with a row count).
  expect(countPricingRequestMessages("StonePharm", "AUR-1A")).toBe(1);

  // 5) No re-mint. The RPC still calls _resolve_or_create_c2c_thread and still
  //    conditionally posts a connection_established intro if a NEW thread got
  //    created — an already-connected pair getting a SECOND c2c thread, or
  //    being told "now connected" a second time, is a live risk in this NEW
  //    mechanism, not a residue of the old accept flow (ADR 0006:381 names
  //    this file as the only guard on this invariant).
  expect(countActiveRelationshipsForPair()).toBe(1);
  expect(countThreadsForPair("c2c")).toBe(1);
  expect(countConnectionEstablishedLines()).toBe(c2cLinesBefore);

  await aliceContext.close();
  await bobContext.close();
});
