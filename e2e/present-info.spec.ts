/**
 * Phase 7 — Present info-card E2E spec (07-01 Wave-0 RED scaffold). UX-05.
 *
 * Behavior: an info card (HQ/warehouse, links) expands on click to show more
 * rows (multiple warehouse addresses, more links) and collapses on click-away
 * or an X.
 *
 * RED until 07-05 (expandable info cards, D-10). The expand/collapse interaction
 * does not exist yet — today the info fields are static single rows. Each case is
 * test.fixme() so it registers without executing. Drop the `.fixme` per case as
 * 07-05 lands the expand UI.
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

// RED until 07-05 — info card expand-on-click does not exist yet.
test.fixme("UX-05 · an info card expands on click", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await expect(card.getByTestId("info-more")).toBeHidden();
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
});

// RED until 07-05 — collapse on the X.
test.fixme("UX-05 · the info card collapses on the X", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  await card.getByRole("button", { name: /close|collapse|×/i }).click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});

// RED until 07-05 — collapse on click-away.
test.fixme("UX-05 · the info card collapses on click-away", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("info-card-warehouse");
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  // click outside the card (the banner) collapses it.
  await page.getByRole("heading", { level: 1 }).click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});
