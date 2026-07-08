import { describe, expect, it } from "vitest";
import { parsePurchaseHistoryCsv, PURCHASE_HISTORY_COLUMNS } from "./csvParse";

const HEADER =
  "Supplier Name,Product Name,Purchase Date,Quantity,Unit,Unit Price (EUR),Currency";

describe("parsePurchaseHistoryCsv", () => {
  it("parses a minimal valid 2-row CSV to 2 rows, zero errors, zero missingHeaders", () => {
    const csv = [
      HEADER,
      "Cantouring,Driftwood Diesel,01-Jul-26,1000,g,4.50,EUR",
      "StonePharm,Blue Dream,2026-07-02,5,kg,3.20,EUR",
    ].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.missingHeaders).toHaveLength(0);
    expect(result.rows[0].supplierName).toBe("Cantouring");
    expect(result.rows[0].quantity).toBe(1000);
    expect(result.rows[0].unit).toBe("g");
  });

  it("reports a missing required 'Unit' column in missingHeaders and produces zero rows", () => {
    const csv = [
      "Supplier Name,Product Name,Purchase Date,Quantity,Unit Price (EUR),Currency",
      "Cantouring,Driftwood Diesel,01-Jul-26,1000,4.50,EUR",
    ].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.missingHeaders).toContain("Unit");
    expect(result.rows).toHaveLength(0);
  });

  it("reports a CellError for a non-numeric Quantity, excluding only that row", () => {
    const csv = [
      HEADER,
      "Cantouring,Driftwood Diesel,01-Jul-26,abc,g,4.50,EUR",
      "StonePharm,Blue Dream,2026-07-02,5,kg,3.20,EUR",
    ].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, column: "Quantity" });
    expect(result.errors[0].message).toMatch(/abc/);
    // the bad row is excluded; the otherwise-valid second row still parses
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplierName).toBe("StonePharm");
  });

  it("reports a CellError for an unrecognized Unit, naming the allowed codes", () => {
    const csv = [HEADER, "Cantouring,Driftwood Diesel,01-Jul-26,1000,lb,4.50,EUR"].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe("Unit");
    expect(result.errors[0].message).toMatch(/g/);
    expect(result.errors[0].message).toMatch(/kg/);
    expect(result.errors[0].message).toMatch(/unit/);
    expect(result.rows).toHaveLength(0);
  });

  it("reports a CellError for an unparseable Purchase Date", () => {
    const csv = [HEADER, "Cantouring,Driftwood Diesel,not-a-date,1000,g,4.50,EUR"].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe("Purchase Date");
    expect(result.rows).toHaveLength(0);
  });

  it("defaults a blank Currency column to EUR, not an error", () => {
    const csv = [HEADER, "Cantouring,Driftwood Diesel,01-Jul-26,1000,g,4.50,"].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].currency).toBe("EUR");
  });

  it("parses German-decimal-comma numbers correctly", () => {
    const csv = [HEADER, "Cantouring,Driftwood Diesel,01-Jul-26,1000,g,\"12,50\",EUR"].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].unitPriceEur).toBe(12.5);
  });

  it("reports an extra unrecognized column in extraHeaders without blocking parsing", () => {
    const csv = [
      HEADER + ",Notes",
      "Cantouring,Driftwood Diesel,01-Jul-26,1000,g,4.50,EUR,some note",
    ].join("\n");

    const result = parsePurchaseHistoryCsv(csv);

    expect(result.extraHeaders).toContain("Notes");
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it("exports PURCHASE_HISTORY_COLUMNS as the single owner of the column template", () => {
    expect(PURCHASE_HISTORY_COLUMNS.map((c) => c.header)).toEqual([
      "Supplier Name",
      "Product Name",
      "Purchase Date",
      "Quantity",
      "Unit",
      "Unit Price (EUR)",
      "Currency",
    ]);
  });
});
