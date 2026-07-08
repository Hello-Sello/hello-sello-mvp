/**
 * RED/GREEN unit contract for saveBuyerResalePrice's upsert-row builder (Phase 18,
 * Plan 09, Task 1 — BUY-01).
 *
 * The behavior under test — "a second edit to the same (buyer, supplier, product)
 * touches only the field being saved, never overwrites the sibling net/gross
 * value" — is isolated into a pure function (buildResalePriceUpsertRow) precisely
 * so it CAN be asserted without a live DB, per the plan's own task-1 acceptance
 * note: "IF the SQL-building logic is isolated as a pure function... this is
 * verified via a unit test". The full saveBuyerResalePrice() wraps this builder
 * with getCurrentCompanyId()/createClient() (real Supabase calls, no live DB
 * here) — that server-boundary wiring is covered by the grep + tsc acceptance
 * criteria instead (mirrors team/actions.test.ts's precedent: only the pure
 * validation/shape layer is unit-tested, not the RPC/DB call itself).
 */
import { describe, it, expect } from "vitest";
import { buildResalePriceUpsertRow } from "./resalePriceActions";

describe("buildResalePriceUpsertRow", () => {
  it("includes only the touched field (net), never the sibling (gross)", () => {
    const row = buildResalePriceUpsertRow(
      { supplierName: "Cantouring", productName: "Driftwood Diesel", field: "net", value: 12.5 },
      "company-1",
      "person-1",
    );
    expect(row).toEqual({
      buyer_company_id: "company-1",
      supplier_name: "Cantouring",
      product_name: "Driftwood Diesel",
      updated_by: "person-1",
      net: 12.5,
    });
    expect(row).not.toHaveProperty("gross");
  });

  it("includes only the touched field (gross), never the sibling (net) — a second edit to the same pair", () => {
    const row = buildResalePriceUpsertRow(
      { supplierName: "Cantouring", productName: "Driftwood Diesel", field: "gross", value: 18 },
      "company-1",
      "person-1",
    );
    expect(row).toEqual({
      buyer_company_id: "company-1",
      supplier_name: "Cantouring",
      product_name: "Driftwood Diesel",
      updated_by: "person-1",
      gross: 18,
    });
    expect(row).not.toHaveProperty("net");
  });

  it("keys the row on the buyer's OWN company id, never a client-supplied one — always the buyerCompanyId arg", () => {
    const row = buildResalePriceUpsertRow(
      { supplierName: "Aurora", productName: "OG Kush", field: "net", value: 9 },
      "the-buyers-company",
      null,
    );
    expect(row.buyer_company_id).toBe("the-buyers-company");
    expect(row.updated_by).toBeNull();
  });
});
