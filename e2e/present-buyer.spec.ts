/**
 * Phase 7 — Present buyer cross-tenant E2E spec (07-01 Wave-0 RED scaffold). R3.
 *
 * Behavior: visiting /present/[companyId] as a CONNECTED, VERIFIED buyer reads
 * the seller's catalogue via the discover RPC (get_discoverable_shop — NOT
 * getMyShop) and shows ONLY profile_visible products (cross-tenant boundary).
 *
 * RED until 07-07 (the buyer shop view, Plan B). The /present/[companyId] route
 * and the getDiscoverableShop wrapper do not exist yet. Each case is
 * test.fixme() so it registers without executing.
 *
 * ⚠️ The deal-TERMINUS assertion (cart -> deal hand-off) is gated on Ayush: no
 * buyer-initiated `source:"shop"` deal door exists today (ADR-0003 "FUTURE",
 * RESEARCH R3 / Open Q1). The buyer cart must NOT call createDeal (it would
 * mis-author the deal as a seller offer). That case is kept test.fixme and
 * EXPLICITLY tagged as Ayush-gated — it must not flip GREEN until the buyer door
 * is defined in the Muskan↔Ayush sync (see 07-07).
 *
 * Uses the seeded two-company world: Bob/StonePharm (buyer) visiting GreenLeaf's
 * shop. They are seeded connected + verified, so the discover RPC returns rows.
 */
import { test, expect, type Page } from "@playwright/test";

// Bob (StonePharm) is the buyer; he visits GreenLeaf's shop cross-tenant.
const BUYER_EMAIL = "bob@stonepharm.test";
const PASSWORD = "password123";

async function signInBuyer(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', BUYER_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// RED until 07-07 — the buyer shop route + getDiscoverableShop do not exist yet.
test.fixme("R3 · a connected verified buyer reads the seller shop via the discover RPC", async ({ page }) => {
  await signInBuyer(page);
  // Reach the seller's shop from Discover (the buyer entry — never getMyShop).
  await page.goto("/discover");
  await page.getByText(/greenleaf/i).first().click();
  // ...lands on /present/[companyId] (or the Discover shop view) — assert the
  // route renders the seller's catalogue, not Bob's own.
  await expect(page).toHaveURL(/\/present\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("product-card").first()).toBeVisible();
});

// RED until 07-07 — only profile_visible products show (cross-tenant filter).
test.fixme("R3 · the buyer view shows ONLY profile_visible products (no leak)", async ({ page }) => {
  await signInBuyer(page);
  await page.goto("/discover");
  await page.getByText(/greenleaf/i).first().click();
  // Every visible card must be a profile_visible product — a hidden product must
  // NOT appear. (The RPC enforces this; the UI must not reach past it.)
  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  // No card carries a "hidden" marker — the RPC never returns hidden rows.
  await expect(page.getByText(/hidden from catalogue/i)).toHaveCount(0);
});

// RED until 07-07 AND gated on Ayush (buyer-initiated deal door — ADR-0003
// FUTURE). Do NOT un-fixme until the Muskan↔Ayush sync defines the buyer door.
test.fixme("R3 · [AYUSH-GATED] the buyer cart hands off to a deal", async ({ page }) => {
  await signInBuyer(page);
  await page.goto("/discover");
  await page.getByText(/greenleaf/i).first().click();
  await page.getByTestId("product-card").first().getByRole("button", { name: /add to basket/i }).click();
  // The terminus is DELIBERATELY unspecified in v1: the buyer cart must route to
  // request-pricing / a "send to seller" message, NOT a direct createDeal (which
  // would mis-author the deal as a seller offer). The real assertion lands once
  // Ayush defines the buyer-initiated door (07-07).
  await page.getByRole("button", { name: /build deal|request|send/i }).click();
  await expect(page.getByText(/sent|requested/i)).toBeVisible();
});
