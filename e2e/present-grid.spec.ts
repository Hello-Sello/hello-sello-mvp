/**
 * Phase 7 — Present grid E2E spec (07-01 Wave-0 RED scaffold). UX-02.
 *
 * Behavior: /present renders products 4-up with SQUARE images; clicking a
 * location tab (Germany | UK | All) filters the grid.
 *
 * RED until 07-03 (square 4-up grid + location tabs). The Present rebuild does
 * not exist yet — the current ShopView grid is 1/2/3/4-col and not square, and
 * there are no location tabs. Every assertion below targets the REBUILT surface,
 * so each case is wrapped in test.fixme(): it registers (visible to
 * `playwright test --list`) but is NOT executed, keeping the suite runnable
 * (no timeout/throw against an unbuilt UI). Drop the `.fixme` per case as 07-03
 * turns it GREEN.
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

// RED until 07-03 — the square 4-up grid does not exist yet.
test.fixme("UX-02 · /present renders products 4-up with square images", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  // Square treatment: the product tile image is aspect-square (object-cover).
  const firstTile = page.getByTestId("product-card").first();
  await expect(firstTile).toBeVisible();
  const box = await firstTile.locator("img").first().boundingBox();
  expect(box).not.toBeNull();
  // square-ish within a 2px tolerance (the aspect-square + object-cover contract).
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
});

// RED until 07-03 — location tabs do not exist yet.
test.fixme("UX-02 · clicking a location tab filters the grid", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const all = await page.getByTestId("product-card").count();
  await page.getByRole("tab", { name: /germany/i }).click();
  const germanyOnly = await page.getByTestId("product-card").count();
  // The Germany tab shows a strict subset (fewer than All, at least one).
  expect(germanyOnly).toBeGreaterThan(0);
  expect(germanyOnly).toBeLessThanOrEqual(all);
  // "All" restores the full set.
  await page.getByRole("tab", { name: /^all$/i }).click();
  expect(await page.getByTestId("product-card").count()).toBe(all);
});
