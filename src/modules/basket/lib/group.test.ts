import { describe, it, expect } from "vitest";
import { groupBySeller } from "./group";
import type { BasketLine } from "../types";

function line(id: string, sellerId: string, sellerName: string): BasketLine {
  return {
    id, productId: `p-${id}`, productName: `Product ${id}`, cultivar: null,
    unit: "g", packCount: 1, packSizeGrams: 50, pricePerGram: 4.5, currency: "EUR",
    pzn: null, sellerCompanyId: sellerId, sellerCompanyName: sellerName,
  };
}

describe("groupBySeller", () => {
  it("groups lines by seller company, first-seen order", () => {
    const lines = [line("1", "co-a", "Alpha"), line("2", "co-b", "Beta"), line("3", "co-a", "Alpha")];
    const groups = groupBySeller(lines, "me", new Map([["co-a", "rel-a"], ["co-b", "rel-b"]]));
    expect(groups.map((g) => g.sellerCompanyId)).toEqual(["co-a", "co-b"]);
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[1].lines).toHaveLength(1);
  });

  it("flags the viewer's own company group and gives it no relationship", () => {
    const lines = [line("1", "me", "My Co")];
    const groups = groupBySeller(lines, "me", new Map());
    expect(groups[0].isOwnCompany).toBe(true);
    expect(groups[0].relationshipId).toBeNull();
  });

  it("attaches the relationship id for another company's group", () => {
    const lines = [line("1", "co-a", "Alpha")];
    const groups = groupBySeller(lines, "me", new Map([["co-a", "rel-a"]]));
    expect(groups[0].isOwnCompany).toBe(false);
    expect(groups[0].relationshipId).toBe("rel-a");
  });
});
