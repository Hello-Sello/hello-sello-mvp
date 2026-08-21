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

const BUYER_EMAIL = "bob@stonepharm.test";
const PASSWORD = "password123";
const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function signInBuyer(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', BUYER_EMAIL);
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
