/**
 * Unit proof for the Deal Basket line-editing rules (phase 3e, FORM-01/FORM-02).
 * Pure helpers - no React, no Supabase, no DB - so the tests are pure too and run
 * sub-second. Mirrors lib/derive.test.ts.
 *
 * Products sell in PACKS: re-adding adds one `pack_size_grams` pack, not a flat
 * amount. Pricing stays per-gram, so quantity is still stored in grams.
 */
import { describe, it, expect } from "vitest";
import {
  addOrIncrement,
  emptyCustomLine,
  packStepGrams,
  packsOf,
  DEFAULT_PACK_GRAMS,
} from "./lineEditing";
import type { CatalogProduct, DraftLineInput } from "../types";

function product(partial: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    name: "Test Flower",
    cultivar: null,
    unit: "g",
    packSizeGrams: 1000,
    unitPrice: 5,
    currency: "EUR",
    thcPercent: null,
    cbdPercent: null,
    pzn: null,
    ...partial,
  };
}

/** The form's real seed (lineFromProduct), trimmed to what the helper reads. */
const seed = (p: CatalogProduct): DraftLineInput => ({
  productId: p.id,
  productName: p.name,
  quantity: packStepGrams(p.packSizeGrams),
  packSizeGrams: p.packSizeGrams,
  unit: "g",
  unitPrice: p.unitPrice,
  currency: p.currency,
});

describe("packStepGrams (one pack in grams)", () => {
  it("uses the product's pack size when set", () => {
    expect(packStepGrams(10)).toBe(10);
    expect(packStepGrams(1000)).toBe(1000);
  });
  it("falls back to the default when missing or zero", () => {
    expect(packStepGrams(null)).toBe(DEFAULT_PACK_GRAMS);
    expect(packStepGrams(0)).toBe(DEFAULT_PACK_GRAMS);
    expect(packStepGrams(undefined)).toBe(DEFAULT_PACK_GRAMS);
  });
});

describe("packsOf (display pack count)", () => {
  it("divides grams by pack size", () => {
    expect(packsOf(30, 10)).toBe(3);
    expect(packsOf(2000, 1000)).toBe(2);
  });
  it("is null when there is no pack size (show grams instead)", () => {
    expect(packsOf(500, null)).toBeNull();
  });
});

describe("addOrIncrement (FORM-01 - add one pack, never duplicate)", () => {
  it("appends a one-pack line for a product not yet on the deal", () => {
    const out = addOrIncrement([], product({ packSizeGrams: 1000 }), seed);
    expect(out).toHaveLength(1);
    expect(out[0].productId).toBe("p1");
    expect(out[0].quantity).toBe(1000);
  });

  it("adds one more PACK when the same product is re-added (1000 g pack)", () => {
    const first = addOrIncrement([], product({ packSizeGrams: 1000 }), seed);
    const second = addOrIncrement(first, product({ packSizeGrams: 1000 }), seed);
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(2000);
  });

  it("steps by the product's OWN pack size (10 g pack)", () => {
    const p = product({ id: "p10", packSizeGrams: 10 });
    const first = addOrIncrement([], p, seed);
    const second = addOrIncrement(first, p, seed);
    expect(first[0].quantity).toBe(10);
    expect(second[0].quantity).toBe(20);
  });

  it("keeps distinct catalogue products on separate lines", () => {
    const a = addOrIncrement([], product({ id: "p1" }), seed);
    const b = addOrIncrement(a, product({ id: "p2", name: "Other" }), seed);
    expect(b).toHaveLength(2);
  });

  it("never merges into a custom (null-id) line - the productId != null guard", () => {
    const custom = emptyCustomLine("Hand-typed");
    const out = addOrIncrement([custom], product(), seed);
    expect(out).toHaveLength(2);
    expect(out[0].productId).toBeNull();
    expect(out[1].productId).toBe("p1");
  });
});

describe("emptyCustomLine (FORM-02 - off-catalogue line)", () => {
  it("has a null productId so it never merges and is carry-forward-skipped by design", () => {
    expect(emptyCustomLine().productId).toBeNull();
  });

  it("has no pack size (the user types grams) and uses the per-gram convention", () => {
    const l = emptyCustomLine();
    expect(l.packSizeGrams).toBeNull();
    expect(l.unit).toBe("g");
    expect(l.unitPrice).toBeNull();
  });

  it("seeds the typed name (the add-by-name custom path)", () => {
    expect(emptyCustomLine("Purple Haze").productName).toBe("Purple Haze");
  });
});
