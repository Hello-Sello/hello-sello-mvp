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
import { filterByLocation, moveBefore, applyProductOrder } from "./locationFilter";

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

describe("moveBefore (in-shop reorder, client-only)", () => {
  it("moves a later card to sit just before an earlier one", () => {
    expect(moveBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an earlier card to sit just before a later one", () => {
    expect(moveBefore(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "a", "c", "d"]);
  });

  it("dragging onto the very first card moves it to the front", () => {
    expect(moveBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when dragged and target are the same, or either is missing", () => {
    expect(moveBefore(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
    expect(moveBefore(["a", "b", "c"], "z", "a")).toEqual(["a", "b", "c"]);
    expect(moveBefore(["a", "b", "c"], "a", "z")).toEqual(["a", "b", "c"]);
  });
});

describe("applyProductOrder (in-shop reorder, client-only)", () => {
  const groups = [
    {
      location: "Germany",
      products: [
        { id: "p1", location: "Germany" },
        { id: "p2", location: "Germany" },
        { id: "p3", location: "Germany" },
      ],
    },
    {
      location: "UK",
      products: [
        { id: "p4", location: "UK" },
        { id: "p5", location: "UK" },
      ],
    },
  ];

  it("re-sorts only the groups named in the order map", () => {
    const out = applyProductOrder(groups, { Germany: ["p3", "p1", "p2"] });
    expect(out[0].products.map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
    expect(out[1].products.map((p) => p.id)).toEqual(["p4", "p5"]); // untouched
  });

  it("leaves groups with no saved order untouched", () => {
    const out = applyProductOrder(groups, {});
    expect(out[0].products.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps products not named in the order after the ranked ones (stable)", () => {
    const out = applyProductOrder(groups, { Germany: ["p3"] });
    expect(out[0].products.map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
  });
});
