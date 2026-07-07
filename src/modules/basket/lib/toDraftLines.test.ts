import { describe, it, expect } from "vitest";
import { toDraftLines } from "./toDraftLines";
import type { BasketGroup } from "../types";

const group: BasketGroup = {
  sellerCompanyId: "co-a", sellerCompanyName: "Alpha", isOwnCompany: false, relationshipId: "rel-a",
  lines: [
    { id: "1", productId: "p1", productName: "Amnesia", cultivar: "Sativa", unit: "g",
      packCount: 3, packSizeGrams: 50, pricePerGram: 4.5, currency: "EUR", pzn: "PZN1",
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha" },
    { id: "2", productId: "p2", productName: "Custom", cultivar: null, unit: "g",
      packCount: 2, packSizeGrams: null, pricePerGram: null, currency: "EUR", pzn: null,
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha" },
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
