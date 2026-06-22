/**
 * Phase 7 — Present manage E2E spec (07-01 Wave-0 RED scaffold). UX-04.
 *
 * Behavior: the seller fully edits a product — rename, delete, reorder/delete/
 * upload images, paste a video link, download a single image. Download-ALL is a
 * human-UAT item (sequential/zip download is hard to assert headless) — noted
 * below, NOT asserted.
 *
 * RED until 07-04/05 (full product edit + media). The rename/delete/video-link
 * actions and the COA/doc/video UI do not exist yet (image add/remove/reorder
 * exist in manage.ts but not the rebuilt card edit UI). Each case is
 * test.fixme() so it registers without executing. Drop the `.fixme` per case as
 * the edit plan lands it.
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

// RED until 07-04 — product rename does not exist yet.
test.fixme("UX-04 · seller renames a product", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("product-card").first();
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel(/name/i).fill("Renamed by E2E");
  await card.getByRole("button", { name: /save/i }).click();
  await expect(card.getByText("Renamed by E2E")).toBeVisible();
});

// RED until 07-04 — product delete (soft delete) does not exist yet.
test.fixme("UX-04 · seller deletes a product", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const before = await page.getByTestId("product-card").count();
  const card = page.getByTestId("product-card").first();
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByRole("button", { name: /delete/i }).click();
  await page.getByRole("button", { name: /confirm|delete/i }).last().click();
  await expect(page.getByTestId("product-card")).toHaveCount(before - 1);
});

// RED until 07-04 — image reorder/delete/upload on the rebuilt card.
test.fixme("UX-04 · seller reorders / deletes / uploads images", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("product-card").first();
  await card.getByRole("button", { name: /edit/i }).click();
  // upload a tiny in-memory image, then it appears as a new gallery slide.
  await card.getByLabel(/upload image/i).setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(card.getByTestId("gallery-thumb")).toHaveCount(2);
});

// RED until 07-04/05 — pasting an external video link (D-08).
test.fixme("UX-04 · seller pastes a video link", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("product-card").first();
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel(/video link/i).fill("https://www.loom.com/share/abc123");
  await card.getByRole("button", { name: /save/i }).click();
  await card.getByRole("button", { name: /flip/i }).click();
  await expect(card.getByRole("link", { name: /video/i })).toBeVisible();
});

// RED until 07-04 — single-image download.
test.fixme("UX-04 · seller downloads a single image", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = page.getByTestId("product-card").first();
  await card.getByRole("button", { name: /edit/i }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /download image/i }).first().click(),
  ]);
  expect(download.suggestedFilename()).toBeTruthy();
});

// NOTE (human-UAT, NOT asserted headless): "Download all" (sequential or zip per
// D-11, Claude's discretion) is verified manually — multi-file download timing is
// unreliable in headless Chromium. Tracked in the phase human-UAT checklist.
