/**
 * Buyer shop view E2E (0022, T02, HEL-56 — PLAN-T02.md rev 3).
 *
 * Behavior under test: a verified buyer at /discover/[companyId] sees the
 * seller's REAL shop — reused ShopView + ProductCard (the G2 variant-A
 * contract: "a new card component is a build failure, not a style choice") —
 * not the retired teaser tile in the current page.tsx. RED until T02 ships
 * BuyerShopView.tsx and rewrites page.tsx: today's page renders a LOCAL
 * `ProductCard` function (page.tsx:160) that never carried
 * `data-testid="product-card"`, so the primary assertion below cannot pass on
 * the unbuilt code — that is deliberate (plan "Test surface", N1).
 *
 * Supersedes e2e/present-buyer.spec.ts (B9 in the plan): that file's three
 * test.fixme cases assert this exact behaviour against `/present/[companyId]`,
 * a route the ADR says "does not exist and never will". This file carries the
 * contract at the real route instead. present-buyer.spec.ts itself is deleted
 * by T02's build (not by this test-writing pass — deletion is a source change).
 *
 * Data (grepped from supabase/seed/seed.sql, T00's visibility × price matrix,
 * not assumed — LEARNINGS L-012):
 *   - GreenLeaf Cultivation = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' (seed.sql:82).
 *   - Bob (bob@stonepharm.test / StonePharm) is seeded CONNECTED + VERIFIED to
 *     GreenLeaf (seed.sql:84 verification_status='verified'; the c2c
 *     relationship at seed.sql:308-323) — the same buyer identity
 *     e2e/present-buyer.spec.ts used for this exact scenario.
 *   - AUR-1A 'Pedanios 31/1 COS-CA' (seed.sql:391): profile_visible=true,
 *     price_public=false (seed.sql:424) — visible, price HIDDEN. This is the
 *     card Request-pricing must appear on.
 *   - AUR-1B 'Pedanios 31/1 PND-CA' (seed.sql:392): profile_visible=true,
 *     price_public=true, no rungs (seed.sql:425).
 *   - AUR-1C / AUR-1D (seed.sql:393-394, seed.sql:426-427): profile_visible=
 *     false — hidden. T06 (connection override) is a SEPARATE ticket not yet
 *     built, so even a connected buyer must not see these through T02 alone;
 *     get_discoverable_shop's WHERE clause is unconditional on
 *     p.profile_visible = true (20260816190000_tier_ladder_contract.sql:143).
 *   - AUR-1E 'Tantalus 24/1 BLB-CA' (seed.sql:400): profile_visible=true,
 *     price_public=true, 2 rungs (seed.sql:490-502).
 *
 * Sign-in mirrors present-grid.spec.ts / discover.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { countPricingRequests, pricingRequestNote } from "./fixtures/two-company";

const BUYER_EMAIL = "bob@stonepharm.test";
// Eva — a THIRD company (Bavaria Medical Cannabis GmbH, seed.sql:282-285,
// verification_status='verified'), NOT connected to GreenLeaf: only a pending
// `connect` sits in GreenLeaf's inbox (seed.sql:371). Criterion 1 is scoped to
// exactly this identity — a non-connected buyer.
const NONCONNECTED_EMAIL = "eva@bavaria.test";
const PASSWORD = "password123";
const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function signInBuyer(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', BUYER_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function signInEva(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', NONCONNECTED_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("a verified buyer at /discover/[companyId] sees the REAL ProductCard (G2 variant-A reuse, plan N1)", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // ProductCard.tsx:386 — the SHARED component /present also renders. The
  // teaser tile page.tsx currently builds locally never carried this testid,
  // so this cannot pass without the real rebuild (not a style regression).
  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
});

test("AC 11: no save, manage-shop, Present-mode or banner/logo-edit control anywhere on the buyer's page", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // Precondition, not the point of this test: confirm we're on the real
  // ShopView-based page. Without this, every assertion below would pass
  // VACUOUSLY on today's teaser page (which also has none of these owner
  // controls, for the unrelated reason that it renders nothing from
  // ShopView at all) — that would be a false green, not a red-first pin.
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  await expect(page.getByText("Manage shop", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Present mode", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("save-changes-btn")).toHaveCount(0);
  await expect(page.getByTestId("edit-logo-btn")).toHaveCount(0);
  await expect(page.getByTestId("assign-products-btn")).toHaveCount(0);
  await expect(page.getByTestId("add-product-tile")).toHaveCount(0);
  await expect(page.getByTestId("add-shop-btn")).toHaveCount(0);

  // Seller SHELF vocabulary is owner chrome too — ADR-0005: "seller-private
  // state never renders in buyer mode." Every buyer product carries
  // `location: null` (the shop RPC returns no location column until T05), so
  // before this guard the buyer's catalogue rendered under a divider header
  // reading "Unassigned", above a "Shop location" dropdown whose only option
  // was "All". Both are meaningless to a buyer, who has no shelves.
  // (critic B2, T02 — found AFTER the first green run, which is why it is
  // asserted here rather than trusted.)
  await expect(page.getByText("Unassigned", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("location-menu-btn")).toHaveCount(0);

  // Owner AUTHORING copy is owner chrome too. MediaManager gates 16 affordances
  // on `canEdit`; this hint was the one that wasn't, so the buyer's card back
  // read "Drag to re-sort · ✕ to remove" — instructions for controls that are
  // not there. Only reachable since T02 put this card on a buyer's page.
  // (visual-verifier, T02 G4.)
  await expect(page.getByText("Drag to re-sort", { exact: false })).toHaveCount(0);
});

test("a price_public=false card (AUR-1A) shows Request-pricing — proves ShopView actually wires viewerIsOwner={false}, not just that ProductCard accepts the prop (plan B3(i))", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // AUR-1A = 'Pedanios 31/1 COS-CA' (seed.sql:391), profile_visible=true,
  // price_public=false (seed.sql:424). T03 already shipped ProductCard's
  // gate + the data-testid="request-pricing" element (ProductCard.tsx:823) —
  // this test is reachable ONLY when ShopView's ProductCard call site
  // actually passes viewerIsOwner={viewerCanManage}, not merely that the
  // prop exists on the component. Deleting that one prop pass-through from
  // ShopView leaves every ProductCard unit test green (ADR round 4's exact
  // finding for this class of gap) — this is the test that catches it.
  const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("request-pricing")).toBeVisible();
});

/**
 * T04 (HEL-58) — per-product request pricing; retire the shop-level CTA
 * (PLAN-T04.md rev 4, Test surface table). RED until the ticket ships:
 * `ProductCard`'s `request-pricing` button's `onClick` is a no-op today
 * (`ShopView` never passes `onRequestPricing` — plan "What is already
 * standing").
 *
 * The row is asserted via SQL (`countPricingRequests` / `pricingRequestNote`),
 * not the seller's own inbox UI — round 2's design (sign in as the seller,
 * count her inbox rows) is not executable: `proxy.ts` redirects a signed-in
 * user away from `/login` and there is no sign-out helper anywhere in `e2e/`,
 * so the identity switch would hang; and `playwright.config.ts` runs one
 * worker against one shared DB, so a bare inbox count would read high across
 * tests. Serial: tests 1 and 2 share Bob's per-product ask on AUR-1A.
 */
test.describe("T04 — per-product request pricing (HEL-58)", () => {
  test.describe.configure({ mode: "serial" });

  test("#1 — the wire is live: Bob's click on AUR-1A swaps the button for a confirmation", async ({ page }) => {
    await signInBuyer(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await expect(card).toBeVisible();
    await card.getByTestId("request-pricing").click();
    // D6: the button swaps to a non-interactive "Pricing requested"
    // confirmation in its own slot — no toast primitive exists in
    // src/shared/ui/.
    await expect(card.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });
  });

  test("#2 — criterion 2: a CONNECTED buyer's ask lands as a pricelist_request naming the product (Bob, AUR-1A)", async ({ page }) => {
    await signInBuyer(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await card.getByTestId("request-pricing").click();
    await expect(card.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });

    // The write proof: exactly one live row. (Test #1 may already have
    // created it — the per-product dup-guard then correctly keeps this at 1
    // rather than adding a second, so the count is stable either way.)
    expect(countPricingRequests("StonePharm", "AUR-1A")).toBe(1);

    // D3: the note names the product — this is what makes criterion 2 true
    // "to the seller's eye" (a bare `metadata` key renders nowhere).
    const note = pricingRequestNote("StonePharm", "AUR-1A");
    expect(note).toContain("Pedanios 31/1 COS-CA");
  });

  test("#3 — criteria 1 + 3: a NON-CONNECTED buyer's ask carries metadata, and the dup-guard is per-product (Eva, AUR-1A then AUR-1F)", async ({ page }) => {
    // AUR-1F ('Zephyr 24/1 ZPH-CA' / cultivar 'Zephyr Haze', seed.sql:409) is
    // the SECOND visible, price-hidden GreenLeaf product — added by T04 for
    // this test, because with only AUR-1A in that corner "ask about A, then
    // ask about B" is not walkable at all and criterion 3 cannot be proven.
    // Its location MUST stay 'Toronto Warehouse': the matrix suite asserts
    // count(DISTINCT location) = 2 across every GreenLeaf product.
    await signInEva(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const aur1a = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await expect(aur1a).toBeVisible();
    await aur1a.getByTestId("request-pricing").click();
    await expect(aur1a.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });

    // RELOAD, then ask again. The confirmation is local `asked` state — no
    // server field re-derives it — so a reload restores the button, and
    // clicking it again is the only way to prove the dup-guard is SERVER-
    // side rather than the client simply hiding a control it already fired
    // (plan "Why test 3 reloads").
    await page.reload();
    const aur1aAfterReload = page
      .getByTestId("product-card")
      .filter({ hasText: "Pedanios 31/1 COS-CA" });
    await aur1aAfterReload.getByTestId("request-pricing").click();
    await expect(aur1aAfterReload.getByText(/pricing requested/i)).toBeVisible({
      timeout: 15000,
    });
    expect(countPricingRequests("Bavaria Medical Cannabis GmbH", "AUR-1A")).toBe(1);

    // A SECOND product — the guard is per-product, never per-pair: this ask
    // must land as its own row, not be swallowed by AUR-1A's pending one.
    // Every locator here is scoped by product name (never a bare
    // getByTestId("request-pricing")) because the buyer's page now renders
    // TWO request-pricing buttons once AUR-1F is seeded (plan N11).
    const aur1f = page.getByTestId("product-card").filter({ hasText: "Zephyr Haze" });
    await expect(aur1f).toBeVisible();
    await aur1f.getByTestId("request-pricing").click();
    await expect(aur1f.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });
    expect(countPricingRequests("Bavaria Medical Cannabis GmbH", "AUR-1F")).toBe(1);
  });
});
