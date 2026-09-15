/**
 * Menus and modals that used to be trapped inside a container.
 *
 * Two kinds of container trapped them: `.glass` columns and cards (on iPad — see
 * fixtures/overlays.ts) and the flipping deal/product cards (transform + perspective,
 * in every browser). A trapped overlay's backdrop covered only its container, so a
 * click outside it did nothing, and a panel near the card's edge was cut off or
 * painted under the card's own controls. One case per kind of container.
 *
 * Every case only opens and closes: nothing is sent, saved, uploaded or deactivated.
 * Data: the seeded Alice–Clara P2P thread carries deals with a workspace.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulateSafariGlass, expectCoversViewport, isOnTop } from "./fixtures/overlays";

test.describe.configure({ mode: "serial" });

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";
const ALICE_CLARA_THREAD = "0fc57313-4048-47e4-9b50-8768d33428fa";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.waitForLoadState("networkidle");
}

test("a chat menu inside the glass list column closes on a click in the thread column", async ({ page }) => {
  await signIn(page);
  await page.goto("/connect/chat");
  const newButton = page.locator('button[aria-haspopup="menu"]').filter({ hasText: /^\s*New\s*$/ }).first();
  await expect(newButton).toBeVisible();
  await emulateSafariGlass(page);
  const vp = page.viewportSize()!;

  await newButton.click();
  const newChat = page.getByRole("button", { name: "New chat" });
  await expect(newChat).toBeVisible();
  expect(await isOnTop(newChat.locator("xpath=.."))).toBe(true);

  await page.mouse.click(vp.width * 0.7, vp.height * 0.5);
  await expect(newChat).toHaveCount(0);
});

test("the deal card's Add menu and people list sit above the card and close outside it", async ({ page }) => {
  await signIn(page);
  await page.goto(`/connect/chat?thread=${ALICE_CLARA_THREAD}`);
  await page.getByRole("button", { name: "Open the deal card" }).first().click();
  const card = page.locator('aside[aria-label="Deal card"]');
  const addSomething = card.getByRole("button", { name: /add something/i }).first();
  await expect(addSomething).toBeVisible();
  const vp = page.viewportSize()!;

  // The Add menu: above everything, and a click outside the card closes it.
  await addSomething.click();
  const addMenu = page.getByRole("button", { name: "Free text" }).locator("xpath=..");
  await expect(addMenu).toBeVisible();
  expect(await isOnTop(addMenu)).toBe(true);
  await page.mouse.click(vp.width * 0.2, vp.height * 0.5);
  await expect(addMenu).toHaveCount(0);

  // The people list opened by an Approve draft: fully on screen and above the
  // card's Negotiate / Sign bar. Escape drops the draft — nothing is written.
  await addSomething.click();
  await page.getByRole("button", { name: "Free text" }).locator("xpath=..").getByRole("button", { name: /Approve/ }).click();
  const people = page.locator("div.glass-strong.max-h-56");
  await expect(people).toBeVisible();
  expect(await isOnTop(people)).toBe(true);
  const box = (await people.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await page.keyboard.press("Escape");
  await expect(people).toHaveCount(0);
});

test("the Upload document modal covers the page, not just the product card", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByRole("button", { name: /manage shop/i }).click();
  const productCard = page.getByTestId("product-card").first();
  await productCard.getByRole("button", { name: /docs.*media/i }).click();
  await productCard.getByRole("button", { name: /upload document/i }).click();

  const dialog = page.getByRole("dialog", { name: /upload document/i });
  await expect(dialog).toBeVisible();
  await expectCoversViewport(page, dialog.locator("xpath=.."));
  expect(await isOnTop(dialog)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("the Deactivate account modal covers the page, not just its settings card", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/security");
  const open = page.getByRole("button", { name: "Deactivate account", exact: true });
  await expect(open).toBeVisible();
  await emulateSafariGlass(page);

  await open.click();
  const backdrop = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(backdrop.getByRole("heading", { name: /deactivate your account/i })).toBeVisible();
  await expectCoversViewport(page, backdrop);

  await backdrop.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(backdrop).toHaveCount(0);
});
