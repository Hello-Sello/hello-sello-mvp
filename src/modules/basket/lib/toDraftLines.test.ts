import { describe, it, expect } from "vitest";
import { toDraftLines } from "./toDraftLines";
import { resolveBasketLine } from "./pack";
import type { BasketGroup, BasketLine } from "../types";

const group: BasketGroup = {
  sellerCompanyId: "co-a", sellerCompanyName: "Alpha", isOwnCompany: false, relationshipId: "rel-a",
  lines: [
    { id: "1", productId: "p1", productName: "Amnesia", cultivar: "Sativa", unit: "g",
      packCount: 3, packSizeGrams: 50, pricePerGram: 4.5, currency: "EUR", pzn: "PZN1",
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha", tiers: [] },
    { id: "2", productId: "p2", productName: "Custom", cultivar: null, unit: "g",
      packCount: 2, packSizeGrams: null, pricePerGram: null, currency: "EUR", pzn: null,
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha", tiers: [] },
  ],
};

describe("toDraftLines", () => {
  it("converts pack count × pack size to grams", () => {
    expect(toDraftLines(group)[0].quantity).toBe(150);
  });

  it("passes price + product identity through", () => {
    const l = toDraftLines(group)[0];
    expect(l.productId).toBe("p1");
    expect(l.unitPrice).toBe(4.5);
    expect(l.pzn).toBe("PZN1");
  });

  it("falls back to the pack count as quantity when pack size is unknown", () => {
    expect(toDraftLines(group)[1].quantity).toBe(2);
    expect(toDraftLines(group)[1].unitPrice).toBeNull();
  });
});

/**
 * Tier resolution at Send (PLAN-T06 / ADR-0004 §4): the written `unitPrice` is
 * the RESOLVED price (rung or base), never the raw base riding through, and the
 * written `quantity`/`unit` are the same grams the drawer resolves on
 * (amendment 4: unit becomes "g" whenever grams are known).
 */
const TIERS = [
  { minGrams: 500, pricePerGram: 8 },
  { minGrams: 1000, pricePerGram: 7 },
];

function basketLine(over: Partial<BasketLine> = {}): BasketLine {
  return {
    id: "t1", productId: "pt", productName: "Tiered", cultivar: null, unit: "g",
    packCount: 2, packSizeGrams: 500, pricePerGram: 10, currency: "EUR", pzn: null,
    sellerCompanyId: "co-a", sellerCompanyName: "Alpha", tiers: TIERS,
    ...over,
  };
}

function groupOf(l: BasketLine): BasketGroup {
  return {
    sellerCompanyId: l.sellerCompanyId, sellerCompanyName: l.sellerCompanyName,
    isOwnCompany: false, relationshipId: "rel-a", lines: [l],
  };
}

describe("toDraftLines (tier resolution)", () => {
  it("writes the rung price when the line's grams reach a rung", () => {
    // 2×500g = 1000g → the 1000 rung (7), not the base (10)
    const d = toDraftLines(groupOf(basketLine()))[0];
    expect(d.unitPrice).toBe(7);
    expect(d.quantity).toBe(1000);
    expect(d.unit).toBe("g");
  });

  it('writes unit "g" when grams are known, even for a non-gram line unit', () => {
    // amendment 4: the quantity IS grams, so the unit says so — structurally,
    // not resting on the unit FK never containing "kg".
    const d = toDraftLines(groupOf(basketLine({ unit: "kg" })))[0];
    expect(d.quantity).toBe(1000);
    expect(d.unit).toBe("g");
    expect(d.unitPrice).toBe(7);
  });

  it('null pack size → quantity = packCount written as unit "unit", resolved on packCount', () => {
    // "unit" (a plain pack count), NOT l.unit: product.unit_code values like
    // "pack"/"mL" are not in the deal_line_unit FK — writing them would fail
    // createDeal. Billing agrees: lineValueOf treats "unit" quantity as-is.
    const d = toDraftLines(groupOf(basketLine({ packSizeGrams: null, unit: "pack" })))[0];
    expect(d.quantity).toBe(2);
    expect(d.unit).toBe("unit");
    expect(d.unitPrice).toBe(10); // 2 is below every rung — base applies
  });

  it("agrees with resolveBasketLine on the rung case (the ADR's drawer↔draft pin)", () => {
    const l = basketLine();
    const r = resolveBasketLine(l);
    const d = toDraftLines(groupOf(l))[0];
    expect(d.unitPrice).toBe(r.pricePerGram);
    expect(d.quantity).toBe(r.quantity);
  });

  it("agrees with resolveBasketLine on the null-pack-size fallback", () => {
    const l = basketLine({ packSizeGrams: null, unit: "pack" });
    const r = resolveBasketLine(l);
    const d = toDraftLines(groupOf(l))[0];
    expect(d.unitPrice).toBe(r.pricePerGram);
    expect(d.quantity).toBe(r.quantity);
  });
});
