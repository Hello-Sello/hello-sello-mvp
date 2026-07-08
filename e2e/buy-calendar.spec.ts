/**
 * Buy calendar E2E — the composed `/buy` page (Phase 18, Plan 13, BUY-01).
 *
 * Behavior under test: signed in as the seeded buyer (Bob/StonePharm), `/buy`
 * renders the 4-card KPI strip with non-placeholder values, the Deals
 * timeline (real `DealCalendar`, `side="buyer"`) renders at least one real
 * ALLOC-SEED pill for GreenLeaf, and clicking a pill opens the real `DealCard`
 * panel (mirrors the manual check already done in plan 18-01 Task 2, now
 * automated).
 *
 * Data note: Bob (bob@stonepharm.test) is the buyer counterparty on
 * ALLOC-SEED-01/03/05 (GreenLeaf <-> StonePharm deals, supabase/seed/seed.sql)
 * — every KPI and pill on his `/buy` traces to that real seeded deal history.
 *
 * Sign-in mirrors present-grid.spec.ts / e2e/fixtures/two-company.ts's Bob
 * credentials.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "bob@stonepharm.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("/buy renders a real, non-placeholder KPI strip", async ({ page }) => {
  await signIn(page);
  await page.goto("/buy");

  const cards = page.getByTestId("kpi-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBe(4);

  const texts = await cards.allTextContents();
  // Every card must trace to real seeded deal data — never the literal
  // placeholder strings a stub would show, and never empty.
  for (const text of texts) {
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toMatch(/coming soon|placeholder|not available/i);
  }
  // "Purchases this month" and "DB1 total" are euro-formatted; sanity-check
  // the currency sign actually renders (real formatting, not a raw number
  // dropped in unstyled).
  expect(texts.join(" ")).toMatch(/€/);
});

test("/buy's Deals timeline renders a real ALLOC-SEED pill and opens the real deal card on click", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/buy");

  await expect(page.getByText(/Purchase calendar/i)).toBeVisible();

  const pills = page.getByTestId("deal-pill");
  await expect(pills.first()).toBeVisible();
  expect(await pills.count()).toBeGreaterThan(0);

  // GreenLeaf is Bob's seeded counterparty (ALLOC-SEED-01/03/05) — the pill's
  // title carries the counterparty name.
  const greenLeafPill = page.locator('[data-testid="deal-pill"][title^="GreenLeaf"]').first();
  await expect(greenLeafPill).toBeVisible();
  await greenLeafPill.click();

  // The real DealCard panel opens (AllocateDealCardHost's twin, BuyDealCardHost)
  // — asserts on the card's own chrome, not a generic "something opened".
  await expect(page.getByText(/Talk about this deal/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/^seller$/i)).toBeVisible();
  // "GreenLeaf Cultivation" also renders on the calendar row itself (behind
  // the now-open panel) — `.last()` since BuyDealCardHost mounts AFTER every
  // section in page.tsx, so its own occurrence is always the last in DOM
  // order.
  await expect(page.getByText("GreenLeaf Cultivation").last()).toBeVisible();
});

test("/buy's sticky section nav scrolls between all 3 sections", async ({ page }) => {
  await signIn(page);
  await page.goto("/buy");

  for (const label of ["Deals timeline", "Analytics", "Buyer-Sella"]) {
    await page.locator("button", { hasText: label }).first().click();
  }

  // The Buyer-Sella STUB's own heading + blurb (not the JumpStrip pill, which
  // is already visible before any click) — proves the jump actually reached
  // the real in-flow section.
  await expect(page.getByRole("heading", { name: "Buyer-Sella" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
});
