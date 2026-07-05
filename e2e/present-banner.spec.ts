/**
 * Phase 7 — Present banner E2E spec (07-05, UX-06).
 *
 * Behavior: the "+Add products" and "Manage shop" controls live in the banner;
 * "Manage shop" turns on in-place edit and reveals a sticky Save that pulses only
 * when there are unsaved changes (data-dirty flips true on the first field edit).
 *
 * RE-SCOPE (07-01→07-05): the old scaffold asserted a "Fullscreen"/present-mode
 * button — that control is 07-06's concern (present mode = in-app chrome-hide),
 * so its assertion moves there and is kept here only as a fixme pointer.
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

test('UX-06 · "+Add products" and "Manage shop" live in the banner', async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const banner = page.getByTestId("present-banner");
  await expect(banner.getByRole("button", { name: /add products/i })).toBeVisible();
  await expect(banner.getByRole("button", { name: /manage shop/i })).toBeVisible();
});

test("UX-06 · Manage shop shows a sticky Save that pulses only when dirty", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();

  const save = page.getByTestId("save-changes-btn");
  await expect(save).toBeVisible();
  // Clean on entry — no unsaved changes, so no pulse.
  await expect(save).toHaveAttribute("data-dirty", "false");

  // Edit the company name in place → the shop is dirty and the Save pulses.
  const name = page.getByRole("textbox", { name: /company name/i });
  await name.click();
  await name.type(" Updated");
  await expect(save).toHaveAttribute("data-dirty", "true");
});

// The present-mode / chrome-hide button is 07-06 (present mode = in-app view, not
// the OS Fullscreen API). Its assertion lives with that plan.
test.fixme("UX-06 · a present-mode button is present in the banner (moved to 07-06)", async () => {});
