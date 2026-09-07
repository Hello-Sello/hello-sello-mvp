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
 * Seed isolation: all 8 mutating cases (rename, soft-delete, upload-image,
 * video-link, COA-empty-state, upload-COA, upload-custom-doc, download-a-file)
 * capture the `.first()` card's real identity (id + name), resolved dynamically by
 * name off the DOM before their own mutation — never a hardcoded product code,
 * since which seed row `.first()` resolves to shifts as earlier tests in the file
 * rename/delete rows. `afterAll` restores every captured row's name and
 * `deleted_at`, verified by an independent read-back — the file is safe to run
 * repeatedly with no `db reset` between runs. The soft-delete case's own restore
 * is load-bearing beyond this file: it specifically targets AUR-1A (the sort-first
 * product in the Toronto group once the rename case has moved AUR-1D's name to
 * "Renamed by E2E"), and `seed_visibility_matrix_test.sql` requires all of
 * AUR-1A–1E present and non-deleted.
 *
 * NOT restored (accepted residue, not this ticket's fix): uploaded storage objects
 * (image/PDF blobs) are left in place — their paths are uuid-suffixed, so a later
 * run never collides with them (MediaManager.tsx:117,146); this ticket's ACs are
 * about the database seed, not storage.
 *
 * NOT this ticket's scope, named rather than silently missed: `present-grid.spec
 * .ts` reads the same seed but is already defensively written around this exact
 * leak (out of scope, L-039). `present-add-product-fields.spec.ts` and `present-
 * edit-model.spec.ts` also leak (insert-without-cleanup / edit-without-restore)
 * but neither affects `seed_visibility_matrix_test.sql`'s AC2 (the matrix query
 * counts DISTINCT location and excuses a sixth product / ignores NULL locations)
 * — deferred by name, two more found along the way, not this ticket's job.
 *
 * NOT asserted here (human-UAT, per the phase checklist): "Download all"
 * (multi-file timing is unreliable headless) and the two native HTML5
 * drag-and-drop flows — media tile drag-reorder and dragging a card into another
 * location group — because Playwright cannot faithfully drive native DnD
 * (dataTransfer) events. The move persists via `setProductLocation` and reorder
 * via `setProductImageOrder`; both are exercised by the UI + verified manually.
 *
 * Run via `npm test`, not a bare `npx playwright test` — the relative import from
 * `./fixtures/catalog` needs `PLAYWRIGHT_FORCE_ASYNC_LOADER=1`, which only the npm
 * script sets (`playwright.config.ts`'s own comment explains why).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { psqlValue, psqlExec, resolveProductId } from "./fixtures/catalog";

// Every case here signs in as the SAME alice@greenleaf.test shop and MUTATES the
// shared seed (rename / soft-delete / upload persist). Under the config's
// `fullyParallel`, the soft-delete case races the media-write cases — deleting a
// product out from under another test's `.first()` card. Pin the file to serial
// so the whole spec is deterministic (each case runs start-to-finish before the
// next); `afterAll` below restores every captured row, so no `db reset` is needed
// between runs.
test.describe.configure({ mode: "serial" });

const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
type CapturedProduct = { id: string; name: string };
const captured: CapturedProduct[] = [];

/** Capture the `.first()` card's real id + name — call BEFORE this test's own
 * mutation, right after `manageShop(page)`, and (for tests 3-8) BEFORE
 * `flipToBack(card)`: the front face carrying the name input leaves the DOM once
 * flipped. Never re-adds an id already captured (rename/soft-delete/upload cases
 * can all resolve to the same product). */
async function captureFirstCardIdentity(page: Page): Promise<void> {
  const card = page.getByTestId("product-card").first();
  const name = await card.getByLabel(/product name/i).inputValue();
  const id = resolveProductId(GREENLEAF_COMPANY_ID, name);
  if (!captured.some((c) => c.id === id)) captured.push({ id, name });
}

test.afterAll(() => {
  expect(captured.length, "at least one product identity must have been captured").toBeGreaterThan(0);
  const failures: string[] = [];
  for (const p of captured) {
    try {
      psqlExec(
        `update product set name = '${p.name.replace(/'/g, "''")}', deleted_at = null where id = '${p.id}'`,
      );
      psqlExec(`delete from product_media where product_id = '${p.id}'`);
      psqlExec(`delete from product_image where product_id = '${p.id}'`);
      const readBack = psqlValue(`select name, deleted_at is null from product where id = '${p.id}'`).split("|");
      if (readBack[0] !== p.name || readBack[1] !== "t") {
        failures.push(`${p.name} (${p.id}): read-back mismatch — got name="${readBack[0]}" not-deleted=${readBack[1]}`);
      }
    } catch (e) {
      failures.push(`${p.name} (${p.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Storage objects are NOT cleaned here — uuid-suffixed paths never collide with a
  // later run (MediaManager.tsx:117,146). Declared, not fixed (N8) — this ticket's
  // ACs are about the database seed, not storage.
  expect(failures, `restore failed for: ${failures.join("; ")}`).toEqual([]);
});

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
  await captureFirstCardIdentity(page);
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
  await captureFirstCardIdentity(page);
  const before = await page.getByTestId("product-card").count();
  await page.getByTestId("product-card").first().getByRole("button", { name: /delete product/i }).click();
  await expect(page.getByTestId("product-card")).toHaveCount(before - 1);
});

test("UX-04 · seller uploads an image to the card back", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardIdentity(page);
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
  await captureFirstCardIdentity(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  await card.getByRole("textbox", { name: "Video link" }).fill("https://www.loom.com/share/abc123");
  await card.getByRole("button", { name: "Add video link" }).click();
  await expect(card.getByRole("link", { name: /open video/i })).toBeVisible();
});

test("UX-04 · Documents folders stay hidden until they hold a file (Cluster G)", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardIdentity(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  // At this point in the shared-seed run order this product has 0 COAs and 0
  // custom docs — neither folder shell (nor its "No files yet." placeholder)
  // should render below the [Upload document] / [Download all] header.
  await expect(card.getByRole("button", { name: /certificates of analysis/i })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /custom uploads/i })).toHaveCount(0);
  await expect(card.getByText("No files yet.")).toHaveCount(0);

  // Upload one COA — only the COA folder should appear; Documents (custom) stays hidden.
  await card.getByRole("button", { name: /upload document/i }).click();
  const modal = page.getByRole("dialog", { name: /upload document/i });
  await modal.getByLabel(/document file/i).setInputFiles({
    name: "empty-state-test.pdf",
    mimeType: "application/pdf",
    buffer: PDF_MIN,
  });
  await modal.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(card.getByRole("button", { name: /certificates of analysis/i })).toBeVisible();
  await expect(card.getByRole("button", { name: /custom uploads/i })).toHaveCount(0);
});

test("UX-04 · seller uploads a COA via the Upload-document popup", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardIdentity(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  // F-03: ONE [Upload document] button opens the type-first popup; COA is the
  // default type and shows only a file drop (no name field). Scope to the dialog
  // so the modal's "Upload" isn't confused with the Media area's "Upload" pill.
  await card.getByRole("button", { name: /upload document/i }).click();
  const modal = page.getByRole("dialog", { name: /upload document/i });
  await modal.getByLabel(/document file/i).setInputFiles({
    name: "coa-test.pdf",
    mimeType: "application/pdf",
    buffer: PDF_MIN,
  });
  await modal.getByRole("button", { name: "Upload", exact: true }).click();
  // The COA folder row is labelled with the filename (minus .pdf).
  await expect(card.getByText("coa-test", { exact: false }).first()).toBeVisible();
});

test("UX-04 · seller uploads a custom document with a name", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardIdentity(page);
  const card = page.getByTestId("product-card").first();
  await flipToBack(card);
  await card.getByRole("button", { name: /upload document/i }).click();
  const modal = page.getByRole("dialog", { name: /upload document/i });
  // Switching the type to "Custom document" reveals the Name field (F-03).
  await modal.getByLabel(/document type/i).selectOption({ label: "Custom document" });
  await modal.getByLabel(/document name/i).fill("Price sheet 2026");
  await modal.getByLabel(/document file/i).setInputFiles({
    name: "sheet.pdf",
    mimeType: "application/pdf",
    buffer: PDF_MIN,
  });
  await modal.getByRole("button", { name: "Upload", exact: true }).click();
  // The custom name persists (reuses product_media.label) and shows in the row.
  await expect(card.getByText("Price sheet 2026", { exact: false }).first()).toBeVisible();
});

test("UX-04 · seller downloads a single media file", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardIdentity(page);
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
