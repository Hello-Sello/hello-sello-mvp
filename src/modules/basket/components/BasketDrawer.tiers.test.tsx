/**
 * Render contract for the drawer's per-line tier display (PLAN-T06, amendment 1).
 *
 * Renders the exported presentational `BasketLineRow` (props-only: the line,
 * its resolved values, callbacks — NO hooks, NO supabase imports) via
 * `react-dom/server` `renderToStaticMarkup`, keeping the repo's pure-`node`
 * vitest env. The RED state: BasketDrawer.tsx does not export `BasketLineRow`
 * yet, so the import throws.
 *
 * Money strings pin `formatMoney`'s REAL de-DE output (amendment 2): suffixed
 * `€` with a NO-BREAK SPACE ( ) before it — "8\u00a0€", "4.000\u00a0€".
 * No `toFixed`, no prototype-style `€4.20`.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketLineRow } from "./BasketDrawer";
import type { BasketLine } from "../types";

const TIERS = [
  { minGrams: 500, pricePerGram: 8 },
  { minGrams: 1000, pricePerGram: 7 },
];

function basketLine(over: Partial<BasketLine> = {}): BasketLine {
  return {
    id: "l1", productId: "p1", productName: "Amnesia", cultivar: "Sativa", unit: "g",
    packCount: 2, packSizeGrams: 250, pricePerGram: 10, currency: "EUR", pzn: null,
    sellerCompanyId: "co-a", sellerCompanyName: "Alpha", tiers: TIERS,
    ...over,
  };
}

const noop = () => {};
const callbacks = {
  onPackCountChange: noop,
  onPackSizeCommit: noop,
  onRemove: noop,
};

describe("<BasketLineRow> (per-line tier price display + pack-size editor)", () => {
  it("shows the resolved €/g, the line total, and the applied-rung chip", () => {
    // 2×250g = 500g → the 500 rung: 8 €/g, total 4.000 €
    const html = renderToStaticMarkup(
      <BasketLineRow
        line={basketLine()}
        resolved={{ grams: 500, quantity: 500, pricePerGram: 8, appliedMin: 500, lineTotal: 4000 }}
        {...callbacks}
      />,
    );
    expect(html).toContain("8\u00a0€/g");
    expect(html).toContain("4.000\u00a0€");
    expect(html).toContain("from 500g applied");
  });

  it("shows the base-price chip when tiers exist but the line sits below the lowest rung", () => {
    const html = renderToStaticMarkup(
      <BasketLineRow
        line={basketLine({ packCount: 1, packSizeGrams: 100 })}
        resolved={{ grams: 100, quantity: 100, pricePerGram: 10, appliedMin: null, lineTotal: 1000 }}
        {...callbacks}
      />,
    );
    expect(html).toContain("base price");
    expect(html).not.toContain("applied");
  });

  it("renders no price segment at all for a price-less line (null base)", () => {
    const html = renderToStaticMarkup(
      <BasketLineRow
        line={basketLine({ pricePerGram: null })}
        resolved={{ grams: 500, quantity: 500, pricePerGram: null, appliedMin: null, lineTotal: null }}
        {...callbacks}
      />,
    );
    expect(html).not.toContain("€");
  });

  it("renders the pack-size editor with its aria-label and the current value", () => {
    const html = renderToStaticMarkup(
      <BasketLineRow
        line={basketLine()}
        resolved={{ grams: 500, quantity: 500, pricePerGram: 8, appliedMin: 500, lineTotal: 4000 }}
        {...callbacks}
      />,
    );
    expect(html).toContain('aria-label="Pack size in grams"');
    expect(html).toContain('value="250"');
  });
});
