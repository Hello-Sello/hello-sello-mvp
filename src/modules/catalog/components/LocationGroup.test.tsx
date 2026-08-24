/**
 * Render contract for `LocationGroup`'s `showHeader` prop (0022, T02 —
 * PLAN-T02.md rev 3, "The one new branch" / B1, B7, N4, N5).
 *
 * `showHeader` does not exist on `LocationGroup` yet — every test below is
 * RED until T02 adds it (default `true`, so `/present` is unchanged).
 *
 * `renderToStaticMarkup` — this repo's vitest env is pure node, no jsdom
 * (`ProductCard.gate.test.tsx` precedent). Initial paint only; `over` (drag
 * hover) local state is out of scope here, same rationale as that file.
 *
 * This file pins ONLY what `LocationGroup` does with its own prop in
 * isolation. It does NOT prove `ShopView` actually passes `showHeader` — that
 * is `e2e/present-grid.spec.ts`'s job (plan "What must be tested that rev 2
 * left untested", B3): deleting `showHeader={loc === "All"}` from `ShopView`'s
 * call site would leave every test in *this* file green, which is exactly the
 * gap ADR round 4 named for `viewerIsOwner`.
 */
import type { ComponentProps } from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationGroup } from "./LocationGroup";

function render(props: Partial<ComponentProps<typeof LocationGroup>> = {}): string {
  return renderToStaticMarkup(
    <LocationGroup location="Toronto Warehouse" count={3} {...props}>
      <div>card</div>
    </LocationGroup>,
  );
}

describe("<LocationGroup> showHeader (T02, HEL-56)", () => {
  it("header renders by default — no showHeader prop supplied (the /present guarantee)", () => {
    const html = render();
    expect(html).toContain("Toronto Warehouse");
  });

  it("showHeader={false} suppresses the header block entirely", () => {
    const html = render({ showHeader: false });
    expect(html).not.toContain("Toronto Warehouse");
  });

  it("showHeader={true} explicitly renders the header, same as the default", () => {
    const html = render({ showHeader: true });
    expect(html).toContain("Toronto Warehouse");
  });

  // ── The count badge and the edit-mode drop hint go WITH the header ────────
  // (LocationGroup.tsx:74-101 — both live inside the same header <div> the
  // label lives in, so suppressing the header must take them too, not just
  // hide the label text.)
  it("the count badge renders with the header by default", () => {
    const html = render({ count: 7 });
    expect(html).toContain(">7<");
  });

  it("showHeader={false} suppresses the count badge too", () => {
    const html = render({ count: 7 });
    const suppressed = render({ count: 7, showHeader: false });
    expect(suppressed).not.toContain(">7<");
    // Sanity: the same fixture DOES contain it when the header is shown, so
    // this isn't a marker that never renders at all.
    expect(html).toContain(">7<");
  });

  it("showHeader={false} suppresses the edit-mode drop hint ('drop products here to move them') too", () => {
    const html = render({ editing: true, showHeader: false });
    expect(html).not.toContain("drop products here to move them");
  });

  it("the edit-mode drop hint DOES render when the header is shown while editing (control for the case above)", () => {
    const html = render({ editing: true });
    expect(html).toContain("drop products here to move them");
  });

  // ── The <section> drop target survives showHeader={false} ─────────────────
  // Plan B1's whole argument for removing the `|| editing` exception depends
  // on this: the drop target is the <section>, not the header, so hiding the
  // header must not also remove drop capability.
  it("the <section> drop target survives showHeader={false} — it is a sibling of the header, not inside it", () => {
    const shown = render({ editing: true, showHeader: true });
    const hidden = render({ editing: true, showHeader: false });
    // Both must still expose the drop target: the section element wrapping
    // the children grid. Its presence is proven by the children rendering at
    // all (the <section> is the outermost element LocationGroup returns).
    expect(shown).toContain("<section");
    expect(hidden).toContain("<section");
    // The children (the card grid this group wraps) render in both cases —
    // the section, and therefore its onDrop handler's mount point, is intact.
    expect(shown).toContain("card");
    expect(hidden).toContain("card");
  });
});
