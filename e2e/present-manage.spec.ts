/**
 * Phase 7 — Present manage E2E (UX-04). The seller fully edits a product from the
 * card: rename, soft-delete, manage back-of-card media (upload image, paste a
 * video link, upload a COA PDF), and download a single file.
 *
 * Aligned to the built DOM (07-04): edit mode is entered via the top "Manage
 * shop" button (edit is a shop-wide state, not a per-card toggle); the card BACK
 * ("Docs & media") is the MediaManager. The seeded GreenLeaf catalogue
 * (alice@greenleaf.test) has products but NO product images, so the upload cases
 * start from an empty media grid.
 *
 * ⚠️ These cases MUTATE the local seed (rename/delete/upload persist). Re-run
 * `supabase db reset` to restore the seed if needed.
 *
 * NOT asserted here (human-UAT, per the phase checklist): "Download all"
 * (multi-file timing is unreliable headless) and the two native HTML5
 * drag-and-drop flows — media tile drag-reorder and dragging a card into another
 * location group — because Playwright cannot faithfully drive native DnD
 * (dataTransfer) events. The move persists via `setProductLocation` and reorder
 * via `setProductImageOrder`; both are exercised by the UI + verified manually.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Enter shop-wide edit mode (the top "Manage shop" button). */
async function manageShop(page: Page) {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByRole("button", { name: /manage shop/i }).click();
}

/** Flip a card to its "Docs & media" back face. */
async function flipToBack(card: Locator) {
  await card.getByRole("button", { name: /docs.*media/i }).click();
}

// A tiny valid 1×1 PNG / minimal PDF in-memory, so uploads don't touch disk.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_MIN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
);

test("UX-04 · seller renames a product (persists under the one Save)", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await card.getByLabel(/product name/i).fill("Renamed by E2E");
  // Rename is now BATCHED under the one pink Save (F-02) — there is no per-card
  // "Save name" button; the name flushes with every other pending edit on Save.
  await page.getByTestId("save-changes-btn").click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");
  await page.reload();
  await expect(page.getByText("Renamed by E2E").first()).toBeVisible();
});

test("UX-04 · seller soft-deletes a product", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // accept the delete confirm
  await manageShop(page);
  const before = await page.getByTestId("product-card").count();
  await page.getByTestId("product-card").first().getByRole("button", { name: /delete product/i }).click();
  await expect(page.getByTestId("product-card")).toHaveCount(before - 1);
});

test("UX-04 · seller uploads an image to the card back", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  await card.getByLabel(/product image file/i).setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });
  // The uploaded photo appears as a tile with its own download control.
  await expect(card.getByRole("button", { name: /download image/i }).first()).toBeVisible();
});

test("UX-04 · seller pastes a video link", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  await card.getByRole("textbox", { name: "Video link" }).fill("https://www.loom.com/share/abc123");
  await card.getByRole("button", { name: "Add video link" }).click();
  await expect(card.getByRole("link", { name: /open video/i })).toBeVisible();
});

test("UX-04 · seller uploads a COA via the Upload-document popup", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  // F-03: ONE [Upload document] button opens the type-first popup; COA is the
  // default type and shows only a file drop (no name field).
  await card.getByRole("button", { name: /upload document/i }).click();
  await card.getByLabel(/document file/i).setInputFiles({
    name: "coa-test.pdf",
    mimeType: "application/pdf",
    buffer: PDF_MIN,
  });
  await card.getByRole("button", { name: /^upload$/i }).click();
  // The COA folder row is labelled with the filename (minus .pdf).
  await expect(card.getByText("coa-test", { exact: false }).first()).toBeVisible();
});

test("UX-04 · seller uploads a custom document with a name", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  await card.getByRole("button", { name: /upload document/i }).click();
  // Switching the type to "Custom document" reveals the Name field (F-03).
  await card.getByLabel(/document type/i).selectOption({ label: "Custom document" });
  await card.getByLabel(/document name/i).fill("Price sheet 2026");
  await card.getByLabel(/document file/i).setInputFiles({
    name: "sheet.pdf",
    mimeType: "application/pdf",
    buffer: PDF_MIN,
  });
  await card.getByRole("button", { name: /^upload$/i }).click();
  // The custom name persists (reuses product_media.label) and shows in the row.
  await expect(card.getByText("Price sheet 2026", { exact: false }).first()).toBeVisible();
});

test("UX-04 · seller downloads a single media file", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  // Upload one image, then download it (the seed has no images to start from).
  await card.getByLabel(/product image file/i).setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });
  const dlBtn = card.getByRole("button", { name: /download image/i }).first();
  await expect(dlBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dlBtn.click(),
  ]);
  expect(download.suggestedFilename()).toBeTruthy();
});
