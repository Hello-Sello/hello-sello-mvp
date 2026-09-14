/**
 * Present photo + document viewer. Clicking a product photo opens it centred and
 * large over a blurred page; arrows step through the photos; the X, Escape, or a
 * click on the blur closes it. A COA on the card back opens in the same viewer
 * instead of downloading, with a Download button.
 *
 * Data: the seeded GreenLeaf catalogue has no photos or documents, so beforeAll
 * uploads two PNGs and one PDF to local storage for ONE product that has no media
 * yet, and afterAll removes exactly those rows and objects. The product is picked
 * last-by-name, away from the `.first()` card `present-manage.spec.ts` mutates.
 *
 * Headless Chromium has no PDF viewer, so what the frame RENDERS is checked live
 * in a real browser; this spec pins the dialog, the frame's source, and Download.
 *
 * Run via `npm test` (the fixtures import needs PLAYWRIGHT_FORCE_ASYNC_LOADER=1).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { psqlValue, psqlExec } from "./fixtures/catalog";
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from "./fixtures/local-supabase";

test.describe.configure({ mode: "serial" });

const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";
const RUN = Date.now();
const COA_LABEL = `E2E Viewer COA ${RUN}`;

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_MIN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf8",
);

const storage = () =>
  createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } })
    .storage.from("shop-media");

let product: { id: string; name: string } | null = null;
const uploaded: string[] = [];

test.beforeAll(async () => {
  const row = psqlValue(
    `select id, name from product p where company_id = '${GREENLEAF_COMPANY_ID}' and deleted_at is null
       and not exists (select 1 from product_image i where i.product_id = p.id)
       and not exists (select 1 from product_media m where m.product_id = p.id)
     order by name desc limit 1`,
  );
  const [id, name] = row.split("|");
  expect(id, "a GreenLeaf product with no media must exist").toBeTruthy();
  product = { id, name };

  const base = `${GREENLEAF_COMPANY_ID}/products/${id}-e2e-viewer-${RUN}`;
  for (const [path, body, contentType] of [
    [`${base}-1.png`, PNG_1x1, "image/png"],
    [`${base}-2.png`, PNG_1x1, "image/png"],
    [`${base}.pdf`, PDF_MIN, "application/pdf"],
  ] as const) {
    const { error } = await storage().upload(path, body, { contentType });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    uploaded.push(path);
  }
  psqlExec(
    `insert into product_image (product_id, company_id, image_path, position) values
       ('${id}', '${GREENLEAF_COMPANY_ID}', '${base}-1.png', 0),
       ('${id}', '${GREENLEAF_COMPANY_ID}', '${base}-2.png', 1)`,
  );
  psqlExec(
    `insert into product_media (product_id, company_id, kind, path, label, position) values
       ('${id}', '${GREENLEAF_COMPANY_ID}', 'coa', '${base}.pdf', '${COA_LABEL}', 0)`,
  );
});

test.afterAll(async () => {
  if (product) {
    psqlExec(`delete from product_media where product_id = '${product.id}' and path like '%-e2e-viewer-${RUN}%'`);
    psqlExec(`delete from product_image where product_id = '${product.id}' and image_path like '%-e2e-viewer-${RUN}%'`);
  }
  if (uploaded.length > 0) await storage().remove(uploaded);
});

async function openShop(page: Page): Promise<Locator> {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/present");
  return page
    .getByTestId("product-card")
    .filter({ has: page.getByText(product!.name, { exact: true }) });
}

test("a product photo opens centred and large, steps with arrows, and closes three ways", async ({ page }) => {
  const card = await openShop(page);
  const photo = card.getByTestId("card-photo");
  const viewer = page.getByTestId("media-lightbox");

  await photo.click();
  await expect(page.getByRole("dialog", { name: /1 of 2/ })).toBeVisible();

  // Centred, and a real step up from the card's 250px frame, but well short of
  // full screen (85% of the height read as too much in review).
  const vp = page.viewportSize()!;
  const box = (await viewer.getByTestId("lightbox-image").boundingBox())!;
  expect(box.height).toBeGreaterThan(vp.height * 0.6);
  expect(box.height).toBeLessThan(vp.height * 0.7);
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2)).toBeLessThanOrEqual(2);

  await viewer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(viewer.getByTestId("lightbox-counter")).toHaveText("2 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByTestId("lightbox-counter")).toHaveText("1 / 2");

  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  await photo.click();
  await page.mouse.click(10, 10); // the blur, clear of every control
  await expect(viewer).toHaveCount(0);

  await photo.click();
  await viewer.getByTestId("lightbox-close").click();
  await expect(viewer).toHaveCount(0);
});

test("Escape closes the photo without also leaving present mode", async ({ page }) => {
  const card = await openShop(page);
  await page.getByTestId("present-banner").getByRole("button", { name: /present mode/i }).click();
  await expect(page.getByTestId("present-layer")).toBeVisible();

  await card.getByTestId("card-photo").click();
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("media-lightbox")).toHaveCount(0);
  await expect(page.getByTestId("present-layer")).toBeVisible();
});

test("a COA on the card back opens in the viewer, with a Download button", async ({ page }) => {
  const card = await openShop(page);
  // "Docs & media" sits inside the photo frame; flipping must not open the photo.
  await card.getByRole("button", { name: /docs.*media/i }).click();
  await expect(page.getByTestId("media-lightbox")).toHaveCount(0);

  await card.getByRole("button", { name: `Open ${COA_LABEL}` }).click();
  const viewer = page.getByRole("dialog", { name: COA_LABEL });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("lightbox-pdf")).toHaveAttribute("src", /e2e-viewer-\d+\.pdf$/);

  const [download] = await Promise.all([
    page.waitForEvent("download", (d) => d.suggestedFilename() === `${COA_LABEL}.pdf`),
    viewer.getByTestId("lightbox-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${COA_LABEL}.pdf`);
});
