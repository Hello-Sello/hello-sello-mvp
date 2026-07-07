/**
 * Phase 7 — Present banner E2E spec (07-05, UX-06 + F-01).
 *
 * Behavior: the "Manage shop" control lives in the banner; "Manage shop" turns on
 * in-place edit and reveals a sticky Save that pulses only when there are unsaved
 * changes (data-dirty flips true on the first field edit). "+ Add products" is NOT
 * a public-shop control — it lives in the edit-mode SaveBar (adding products is a
 * manage-shop action), so the public shop view never shows it.
 *
 * F-01 (fidelity) additions: "Manage shop" is now the ONE edit entry and it puts
 * the WHOLE page into a calm grey edit wash (the surface wrapper flips
 * data-edit="on"); the separate "Edit logo & branding" button is gone — the logo
 * tile itself is the inline edit affordance (opens the one BrandingEditForm
 * writer); the pink Save bar is the only commit control.
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

test('UX-06 · "Manage shop" lives in the banner; "Add products" moves into edit mode', async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const banner = page.getByTestId("present-banner");
  // "Manage shop" is the banner's edit entry; the banner no longer carries an
  // "Add products" control — adding products is a manage-shop action. (An empty
  // shop may still show an "Add products" CTA in the grid, so we scope to the
  // banner, not the whole page.)
  await expect(banner.getByRole("button", { name: /manage shop/i })).toBeVisible();
  await expect(banner.getByRole("button", { name: /add products/i })).toHaveCount(0);

  // Entering "Manage shop" reveals "+ Add products" in the sticky SaveBar.
  await banner.getByRole("button", { name: /manage shop/i }).click();
  await expect(page.getByRole("button", { name: /add products/i })).toBeVisible();
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

// The present-mode / chrome-hide button is delivered in 07-06 (present mode =
// in-app view, not the OS Fullscreen API). The full chrome-hide + Exit/ESC +
// company-chip behaviour is asserted in present-mode.spec.ts; here we just confirm
// the entry control now lives in the banner (the 07-05 fixme, now enabled).
test("UX-06 · a present-mode button is present in the banner", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await expect(
    page.getByTestId("present-banner").getByRole("button", { name: /present mode/i }),
  ).toBeVisible();
});

// F-01 — the unified edit model. "Manage shop" is the single entry point; it puts
// the whole page into a calm grey wash (surface flips data-edit="on"); the pink
// Save bar is the only commit control.
test("F-01 · Manage shop puts the whole page into a grey edit wash", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  const surface = page.getByTestId("shop-surface");
  await expect(surface).toHaveAttribute("data-edit", "off");

  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();

  // The whole-page grey edit mode is on (data-edit drives the calm grey tint).
  await expect(surface).toHaveAttribute("data-edit", "on");
  // The pink Save bar is the ONLY commit control and is now visible.
  await expect(page.getByTestId("save-changes-btn")).toBeVisible();
});

// F-01 — the separate "Edit logo & branding" button is gone; the logo tile itself
// is the inline edit affordance (opens the shared one BrandingEditForm writer).
test("F-01 · no separate branding button — the logo is edited inline", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const banner = page.getByTestId("present-banner");
  await banner.getByRole("button", { name: /manage shop/i }).click();

  // The old split control is gone in edit mode.
  await expect(banner.getByRole("button", { name: /edit logo & branding/i })).toHaveCount(0);
  // The logo tile is now the inline edit affordance.
  await expect(banner.getByTestId("edit-logo-btn")).toBeVisible();
});
