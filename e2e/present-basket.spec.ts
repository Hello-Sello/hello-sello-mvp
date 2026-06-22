/**
 * Phase 7 — Present basket E2E spec (07-01 Wave-0 RED scaffold). UX-03.
 *
 * Behavior: a qty +/- stepper changes quantity; "Add to basket" shows a
 * top-right basket; a two-company session keeps carts separated.
 *
 * RED until 07-03 (qty stepper + per-company basket). No basket/cart UI exists
 * in the app today (RESEARCH: net-new, no analog). Each case is test.fixme() so
 * it registers without executing against the unbuilt surface. Drop the `.fixme`
 * per case as 07-03 lands the basket.
 *
 * The two-company separation case reuses the seeded GreenLeaf/StonePharm world
 * via openTwoContexts (e2e/fixtures/two-company.ts) — the same fixture the
 * deal-change suite uses for two independent sessions.
 */
import { test, expect, type Page } from "@playwright/test";
import { openTwoContexts } from "./fixtures/two-company";

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// RED until 07-03 — the qty stepper does not exist yet.
test.fixme("UX-03 · the +/- stepper changes the quantity", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("product-card").first();
  const qty = card.getByTestId("qty");
  await expect(qty).toHaveText("1");
  await card.getByRole("button", { name: "+" }).click();
  await expect(qty).toHaveText("2");
  await card.getByRole("button", { name: "−" }).click();
  await expect(qty).toHaveText("1");
});

// RED until 07-03 — the top-right basket does not exist yet.
test.fixme('UX-03 · "Add to basket" shows the basket top-right', async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await page.getByTestId("product-card").first().getByRole("button", { name: /add to basket/i }).click();
  const basket = page.getByTestId("basket-panel");
  await expect(basket).toBeVisible();
  await expect(basket.getByTestId("basket-line")).toHaveCount(1);
});

// RED until 07-03 — per-company cart separation (the two-company UX-03 case).
test.fixme("UX-03 · a two-company session keeps carts separated", async ({ browser }) => {
  // Two independent sessions (Alice/GreenLeaf and Bob/StonePharm). Each builds a
  // cart on a shop; neither cart bleeds into the other company's bucket.
  const { alicePage, bobPage, aliceContext, bobContext } = await openTwoContexts(browser);
  try {
    await alicePage.goto("/present");
    await alicePage.getByTestId("product-card").first().getByRole("button", { name: /add to basket/i }).click();
    await bobPage.goto("/present");
    await bobPage.getByTestId("product-card").first().getByRole("button", { name: /add to basket/i }).click();
    // Alice's basket shows only GreenLeaf's company group; Bob's only StonePharm's.
    await expect(alicePage.getByTestId("basket-group")).toHaveCount(1);
    await expect(bobPage.getByTestId("basket-group")).toHaveCount(1);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
