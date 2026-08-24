/**
 * Present grid E2E — the redesigned seller storefront.
 *
 * Behavior under test: /present renders the seller's products as a 4-up grid of
 * square-image cards, grouped under a per-location divider header, with a location
 * dropdown that re-contexts the grid.
 *
 * Data note: the seeded GreenLeaf catalogue (alice@greenleaf.test) carries two
 * named `product.location` values (Toronto Warehouse, Montreal Warehouse — T00,
 * 0022-buyer-shop-view), so the dropdown lists "All locations" plus both named
 * tabs and selecting a named tab genuinely narrows the grid. The strict
 * multi-location subset behavior is additionally proven exhaustively by the
 * pure unit test (src/app/present/locationFilter.test.ts).
 *
 * Sign-in mirrors public-profile.spec.ts (seeded alice@greenleaf.test).
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("/present renders products in a 4-up grid with square images", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  // Square treatment: the photo region is aspect-square, so its rendered box is
  // square within a small rounding tolerance — whether or not a cover image is
  // present (the seeded catalogue has no product images).
  const box = await cards.first().getByTestId("card-photo").boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
});

test("products render under a location divider and the location dropdown re-contexts the grid", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  const all = await page.getByTestId("product-card").count();
  expect(all).toBeGreaterThan(0);

  // The location dropdown opens and offers "All locations".
  await page.getByTestId("location-menu-btn").click();
  const allOption = page.getByTestId("location-option").filter({ hasText: /all locations/i });
  await expect(allOption).toBeVisible();

  // Selecting "All" keeps the full set (and closes the menu).
  await allOption.click();
  await expect(page.getByTestId("location-option")).toHaveCount(0);
  expect(await page.getByTestId("product-card").count()).toBe(all);

  // Selecting a NAMED location narrows the grid to just that location's
  // products (T00 seeds two named locations on GreenLeaf's catalogue, Toronto
  // Warehouse + Montreal Warehouse). This is the only committed assertion of
  // T00's third criterion (two distinct product.location values ⇒ the tabs
  // render more than "All"). Deliberately relative, not a literal count: the
  // shared-seed harness lets present-manage.spec.ts soft-delete `.first()`
  // between runs without a reset, so a literal expected number would flake.
  // `toHaveCount` (not a plain `.count()` read) auto-retries against that.
  await page.getByTestId("location-menu-btn").click();
  const torontoOption = page.getByTestId("location-option").filter({ hasText: "Toronto Warehouse" });
  await expect(torontoOption).toBeVisible();
  await torontoOption.click();
  await expect(page.getByTestId("location-option")).toHaveCount(0);
  const torontoCards = page.getByTestId("product-card");
  await expect(torontoCards).not.toHaveCount(0);
  await expect(torontoCards).not.toHaveCount(all);

  // T02 (HEL-56, PLAN-T02.md rev 3, "What must be tested that rev 2 left
  // untested" B3(ii)): under a single NAMED location, LocationGroup's own
  // header repeats the name the dropdown trigger already shows one line
  // above — `showHeader={loc === "All"}` retires it. The header renders as
  // a <b> tag (LocationGroup.tsx:94); the dropdown trigger button shows the
  // same text in a plain <button>, so scoping to <b> is what tells the two
  // apart — a bare text-match assertion would still pass with the button's
  // label present. This is the seller-side pin: rev 2's LocationGroup-only
  // unit test proves the prop works in isolation but not that ShopView wires
  // it, exactly the gap that let AC 3's viewerIsOwner ship unwired once.
  await expect(page.locator("b", { hasText: "Toronto Warehouse" })).toHaveCount(0);
});
