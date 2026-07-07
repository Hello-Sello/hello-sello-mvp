/**
 * Phase 7 — Present info-card E2E spec (07-05, UX-05).
 *
 * Behavior: equal-height info boxes clamp overflow and reveal it on click; the
 * expanded panel is solid-white and sits ABOVE the flip-card grid (own stacking
 * context); it collapses on the ✕ or a click-away. The company description is
 * hard-capped at 2600 characters in edit mode.
 *
 * RE-SCOPE (07-01→07-05): from "multiple warehouse addresses" to the single-line
 * warehouse + reveal-more model (multi-warehouse management is Phase 16).
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

test("UX-05 · an info card expands on click to reveal more", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await expect(card.getByTestId("info-more")).toBeHidden();
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
});

test("UX-05 · the info card collapses on the ✕", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  await card.getByRole("button", { name: /close/i }).click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});

test("UX-05 · the info card collapses on click-away", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  // click outside the card (the banner) collapses it.
  await page.getByTestId("present-banner").click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});

test("UX-05 · the expanded info panel sits above the product grid", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  // its own stacking context is elevated above the flip-card grid (bug-2 fix).
  const z = await card.evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(z)).toBeGreaterThanOrEqual(10);
});

test("UX-05 · the description field is capped at 2600 characters", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await page.getByRole("button", { name: /manage shop/i }).click();
  const desc = page.getByRole("textbox", { name: /company description/i });
  await expect(desc).toHaveAttribute("maxlength", "2600");
});
