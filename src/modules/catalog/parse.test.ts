/**
 * Focused unit contract for the "number_list" column type (Additional pack
 * sizes) — parse.ts had no test file before this. Scoped to the new coercion
 * path, not full parseProductsCsv coverage.
 */
import { describe, it, expect } from "vitest";
import { parseProductsCsv } from "./parse";
import { buildCsv } from "./template";

// buildCsv is the SAME builder AddProductsDrawer's manual form uses — it quotes
// cells containing commas correctly, which a hand-rolled CSV string wouldn't
// (the list value itself contains commas).
function csv(additionalPackSizes: string) {
  return buildCsv([{
    "Product name": "Pedanios 31/1",
    "THC %": "22,5",
    "CBD %": "10",
    "Pack size (g)": "10",
    "Additional pack sizes (g)": additionalPackSizes,
    "Unit": "g",
    "Supplier code": "SUP-1",
    "Dominance": "sativa",
    "Irradiation": "gamma",
    "Basic price per g": "5",
  }]);
}

describe("number_list column (Additional pack sizes (g))", () => {
  it("parses a comma-separated list into numbers", () => {
    const { rows, errors } = parseProductsCsv(csv("10, 20, 50"));
    expect(errors).toEqual([]);
    expect(rows[0].product.pack_sizes).toEqual([10, 20, 50]);
  });

  it("is optional — blank cell means no pack_sizes key at all", () => {
    const { rows, errors } = parseProductsCsv(csv(""));
    expect(errors).toEqual([]);
    expect(rows[0].product).not.toHaveProperty("pack_sizes");
  });

  it("reports a cell error naming the offending piece, not the whole cell", () => {
    const { errors } = parseProductsCsv(csv("10, oops, 50"));
    expect(errors).toEqual([
      { row: 1, column: "Additional pack sizes (g)", message: '"oops" is not a number' },
    ]);
  });
});
