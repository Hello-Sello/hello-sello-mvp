/**
 * Checks for floating panels and modals that must sit above the whole page.
 *
 * Our e2e browser is Chromium, but the bug these guard against shows on iPad: the
 * CSS build keeps only `-webkit-backdrop-filter` for `.glass`, which Safari applies
 * and Chromium ignores. A glass element becomes its own stacking context and the
 * containing block for `position: fixed`, so an overlay rendered inside one covers
 * only that element. `emulateSafariGlass` makes Chromium lay the page out the same
 * way. (Flipping cards trap overlays through transform/perspective in every
 * browser, so those need no emulation.)
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** Apply the glass backdrop-filter the way Safari does. Call after each navigation. */
export async function emulateSafariGlass(page: Page): Promise<void> {
  await page.addStyleTag({
    content: ".glass{backdrop-filter:blur(20px)}.glass-strong{backdrop-filter:blur(24px)}",
  });
}

/** True when nothing is painted over the panel at its centre and near its corners. */
export async function isOnTop(panel: Locator): Promise<boolean> {
  return panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].every(([fx, fy]) => {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      return !!hit && el.contains(hit);
    });
  });
}

/** An overlay's backdrop must span the whole viewport, not just its container. */
export async function expectCoversViewport(page: Page, backdrop: Locator): Promise<void> {
  const box = await backdrop.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, "the backdrop is rendered").not.toBeNull();
  expect(Math.round(box!.width)).toBe(vp.width);
  expect(Math.round(box!.height)).toBe(vp.height);
}
