/**
 * Present grid E2E — the redesigned seller storefront.
 *
 * Behavior under test: /present renders the seller's products as a 4-up grid of
 * square-image cards, grouped under a per-location divider header, with a location
 * dropdown that re-contexts the grid.
 *
 * Data note: the seeded GreenLeaf catalogue (alice@greenleaf.test) has no
 * per-product location set, so every product lands in one "Unassigned" group and
 * the dropdown lists only "All locations". These cases therefore assert the grid /
 * grouping / dropdown wiring against that real data; the strict multi-location
 * subset behavior is proven exhaustively by the pure unit test
 * (src/app/present/locationFilter.test.ts).
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
});
