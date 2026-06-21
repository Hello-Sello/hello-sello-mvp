/**
 * RED-first unit contract for the location-tab filter (UX-02, D-06/D-07).
 * Phase 7, plan 07-01 (Wave 0). vitest, a pure import, no Supabase, no React.
 *
 * INTENTIONALLY RED: `./locationFilter` does not exist yet — plan 07-03 (the
 * square 4-up grid + location tabs) creates it. The module-not-found on this
 * import is the Wave 0 success signal. Do NOT create the production module here.
 *
 * The filter is the pure logic behind the Germany | UK | All tabs: "All"
 * returns everything; a named location returns only its products; a
 * null-location product surfaces ONLY under "All".
 */
import { describe, it, expect } from "vitest";
// RED until 07-03 — locationFilter.ts is created by the grid + tabs plan.
import { filterByLocation } from "./locationFilter";

const products = [
  { id: "p1", name: "Aurora Haze 24", location: "Germany" },
  { id: "p3", name: "Citrus Drift 21", location: "UK" },
  { id: "p4", name: "Northern Mist 26", location: "UK" },
  { id: "p9", name: "Unassigned Lot", location: null },
];

describe("filterByLocation (UX-02 location tabs, D-06)", () => {
  it('"All" returns every product (incl. the null-location one)', () => {
    expect(filterByLocation(products, "All").map((p) => p.id)).toEqual([
      "p1",
      "p3",
      "p4",
      "p9",
    ]);
  });

  it('"Germany" returns only products whose location === "Germany"', () => {
    expect(filterByLocation(products, "Germany").map((p) => p.id)).toEqual(["p1"]);
  });

  it('"UK" returns only the UK products', () => {
    expect(filterByLocation(products, "UK").map((p) => p.id)).toEqual(["p3", "p4"]);
  });

  it("a null-location product appears ONLY under \"All\", never a named tab", () => {
    expect(filterByLocation(products, "Germany").some((p) => p.id === "p9")).toBe(false);
    expect(filterByLocation(products, "UK").some((p) => p.id === "p9")).toBe(false);
    expect(filterByLocation(products, "All").some((p) => p.id === "p9")).toBe(true);
  });

  it("returns an empty array when no product matches a named location", () => {
    expect(filterByLocation(products, "France")).toEqual([]);
  });
});
