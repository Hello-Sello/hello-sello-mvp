/**
 * RED-first unit contract for the shop's warehouse/location list (Phase 7 Round 2,
 * F-07 / Cluster H — a lightweight partial pull-forward of D-05). Covers the two
 * non-trivial pure transforms: validating a client/DB-supplied locations array, and
 * deriving the initial list a shop reads (metadata.locations wins; otherwise seed
 * ONE row from the legacy single-line `company.warehouse_location` column so no
 * seller's existing text is silently dropped). vitest, no Supabase, no React.
 *
 * RED until locations.ts exists (the import fails to resolve). Do NOT create the
 * production module to satisfy an unrelated gate — this test drives its shape.
 */
import { describe, it, expect } from "vitest";
import { validateLocations, deriveInitialLocations, renumberLocations } from "./locations";

describe("validateLocations — shape-check a locations array (mirrors parseLinks)", () => {
  it("returns [] for a non-array", () => {
    expect(validateLocations(undefined)).toEqual([]);
    expect(validateLocations(null)).toEqual([]);
    expect(validateLocations("not an array")).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(validateLocations([])).toEqual([]);
  });

  it("keeps a well-formed row, trimming whitespace", () => {
    expect(validateLocations([{ label: "  Warehouse 1  ", value: "  Berlin  " }])).toEqual([
      { label: "Warehouse 1", value: "Berlin" },
    ]);
  });

  it("drops a row missing label or value", () => {
    expect(validateLocations([{ label: "Warehouse 1" }, { value: "Berlin" }])).toEqual([]);
  });

  it("drops a row whose label or value is not a string", () => {
    expect(validateLocations([{ label: 1, value: "Berlin" }, { label: "Warehouse 1", value: null }])).toEqual([]);
  });

  it("drops a row that trims to an empty string", () => {
    expect(validateLocations([{ label: "   ", value: "Berlin" }])).toEqual([]);
    expect(validateLocations([{ label: "Warehouse 1", value: "   " }])).toEqual([]);
  });

  it("keeps well-formed rows and drops malformed ones in the same array", () => {
    expect(
      validateLocations([
        { label: "Warehouse 1", value: "Berlin" },
        { label: "Warehouse 2" }, // missing value — dropped
        { label: "Warehouse 3", value: "Rotterdam" },
      ]),
    ).toEqual([
      { label: "Warehouse 1", value: "Berlin" },
      { label: "Warehouse 3", value: "Rotterdam" },
    ]);
  });
});

describe("deriveInitialLocations — the seed rule (Cluster H)", () => {
  it("returns [] when metadata has no locations and the legacy column is null", () => {
    expect(deriveInitialLocations(null, null)).toEqual([]);
    expect(deriveInitialLocations({}, null)).toEqual([]);
  });

  it("returns [] when the legacy column is only whitespace", () => {
    expect(deriveInitialLocations({}, "   ")).toEqual([]);
  });

  it("seeds ONE 'Warehouse 1' row from the legacy column when metadata is empty", () => {
    expect(deriveInitialLocations({}, "Berlin")).toEqual([{ label: "Warehouse 1", value: "Berlin" }]);
    expect(deriveInitialLocations(null, "  Berlin  ")).toEqual([{ label: "Warehouse 1", value: "Berlin" }]);
  });

  it("prefers metadata.locations over the legacy column when both are present", () => {
    const metadata = { locations: [{ label: "Warehouse 1", value: "Rotterdam" }] };
    expect(deriveInitialLocations(metadata, "Berlin")).toEqual([{ label: "Warehouse 1", value: "Rotterdam" }]);
  });

  it("does not seed from the legacy column once metadata carries any locations", () => {
    const metadata = { locations: [{ label: "Warehouse 1", value: "Vienna" }] };
    expect(deriveInitialLocations(metadata, null)).toEqual([{ label: "Warehouse 1", value: "Vienna" }]);
  });

  it("drops malformed metadata.locations entries the same way validateLocations does", () => {
    const metadata = { locations: [{ label: "Warehouse 1" }] }; // missing value
    // The stored array is empty after validation, so it falls through to the legacy seed.
    expect(deriveInitialLocations(metadata, "Berlin")).toEqual([{ label: "Warehouse 1", value: "Berlin" }]);
  });
});

describe("renumberLocations — keeps labels sequential after add/remove", () => {
  it("returns [] for an empty list", () => {
    expect(renumberLocations([])).toEqual([]);
  });

  it("labels rows Warehouse 1..N by position, regardless of prior labels", () => {
    expect(
      renumberLocations([
        { label: "stale", value: "Berlin" },
        { label: "Warehouse 7", value: "Rotterdam" },
      ]),
    ).toEqual([
      { label: "Warehouse 1", value: "Berlin" },
      { label: "Warehouse 2", value: "Rotterdam" },
    ]);
  });
});
