import { describe, expect, it } from "vitest";
import {
  dealHistoryPartners,
  mergePartners,
  type CompanyRow,
  type DealCardRow,
  type RelationshipRow,
} from "./partners";

const CALLER = "company-caller";

/** Builds a minimal offer/order deal_card row for narrowing tests. */
function card(relationshipId: string, dealType: "offer" | "order", initiatingCompanyId: string): DealCardRow {
  return { relationship_id: relationshipId, deal_type: dealType, initiating_company_id: initiatingCompanyId };
}

function relationship(id: string, companyAId: string, companyBId: string): RelationshipRow {
  return { id, company_a_id: companyAId, company_b_id: companyBId };
}

function company(id: string, name: string): CompanyRow {
  return { id, name };
}

describe("dealHistoryPartners (buyer-only narrowing)", () => {
  it("resolves 2 connected partners when the caller is the buyer in 2 relationships", () => {
    // deal_type "order" = buyer-initiated: the initiator is the buyer, the OTHER
    // company in the relationship is the seller (mirrors sellerCompanyId's rule).
    const cards = [
      card("rel-1", "order", CALLER),
      card("rel-2", "order", CALLER),
    ];
    const relationships = [
      relationship("rel-1", CALLER, "company-supplier-a"),
      relationship("rel-2", "company-supplier-b", CALLER),
    ];
    const companies = [company("company-supplier-a", "Supplier A"), company("company-supplier-b", "Supplier B")];

    const result = dealHistoryPartners(cards, relationships, companies, CALLER);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { relationshipId: "rel-1", companyId: "company-supplier-a", name: "Supplier A" },
        { relationshipId: "rel-2", companyId: "company-supplier-b", name: "Supplier B" },
      ]),
    );
    for (const p of result) {
      expect(p.relationshipId).toBeTruthy();
    }
  });

  it("excludes a relationship where the caller is the SELLER, not the buyer (Pitfall 5)", () => {
    // deal_type "offer" = seller-initiated: the initiator IS the seller — if the
    // caller initiated an offer, the caller is the seller, not the buyer.
    const cards = [card("rel-seller-side", "offer", CALLER)];
    const relationships = [relationship("rel-seller-side", CALLER, "company-buyer-x")];
    const companies = [company("company-buyer-x", "Buyer X")];

    const result = dealHistoryPartners(cards, relationships, companies, CALLER);

    expect(result).toHaveLength(0);
  });

  it("dedupes multiple deal_cards on the same relationship to one partner row", () => {
    const cards = [
      card("rel-1", "order", CALLER),
      card("rel-1", "order", CALLER),
    ];
    const relationships = [relationship("rel-1", CALLER, "company-supplier-a")];
    const companies = [company("company-supplier-a", "Supplier A")];

    const result = dealHistoryPartners(cards, relationships, companies, CALLER);

    expect(result).toHaveLength(1);
  });
});

describe("mergePartners (CSV-only merge/dedup)", () => {
  it("returns 3 unconnected rows (relationshipId null) for 3 CSV suppliers with zero deal history", () => {
    const result = mergePartners([], ["Aurora GmbH", "Cantouring", "Nordlicht Pharma"]);

    expect(result).toHaveLength(3);
    for (const p of result) {
      expect(p.connected).toBe(false);
      expect(p.relationshipId).toBeNull();
      expect(p.companyId).toBeNull();
    }
    expect(result.map((p) => p.name).sort()).toEqual(["Aurora GmbH", "Cantouring", "Nordlicht Pharma"].sort());
  });

  it("dedupes an exact-match CSV supplier_name into the connected partner's row (connected wins)", () => {
    const dealPartners = [{ relationshipId: "rel-1", companyId: "company-supplier-a", name: "Cantouring" }];
    const result = mergePartners(dealPartners, ["Cantouring", "Nordlicht Pharma"]);

    expect(result).toHaveLength(2);
    const cantouring = result.find((p) => p.name === "Cantouring");
    expect(cantouring).toEqual({
      key: "Cantouring",
      name: "Cantouring",
      connected: true,
      relationshipId: "rel-1",
      companyId: "company-supplier-a",
    });
    const nordlicht = result.find((p) => p.name === "Nordlicht Pharma");
    expect(nordlicht?.connected).toBe(false);
  });

  it("keeps a near-miss CSV name as its own separate unconnected row — no fuzzy matching (v0 limitation)", () => {
    const dealPartners = [{ relationshipId: "rel-1", companyId: "company-supplier-a", name: "Cantouring" }];
    // "Cantouring GmbH" does NOT exactly match the connected company's real
    // name "Cantouring" — this is the documented v0 limitation, not a bug.
    const result = mergePartners(dealPartners, ["Cantouring GmbH"]);

    expect(result).toHaveLength(2);
    const connectedRow = result.find((p) => p.name === "Cantouring");
    expect(connectedRow?.connected).toBe(true);
    const csvOnlyRow = result.find((p) => p.name === "Cantouring GmbH");
    expect(csvOnlyRow).toEqual({
      key: "Cantouring GmbH",
      name: "Cantouring GmbH",
      connected: false,
      relationshipId: null,
      companyId: null,
    });
  });
});
