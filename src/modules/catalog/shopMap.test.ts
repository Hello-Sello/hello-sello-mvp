/**
 * RED-first unit contract for the Present shop pure mappers (Phase 7, 07-01).
 * Covers the representative-batch pick + the derived Terp% (D-01) — the two
 * non-trivial pure transforms getMyShop composes. vitest, no Supabase, no React.
 *
 * RED until shopMap.ts exists (the import fails to resolve). Do NOT create the
 * production module to satisfy an unrelated gate — this test drives its shape.
 */
import { describe, it, expect } from "vitest";
import { pickRepresentativeBatch, deriveTerpPercent } from "./shopMap";

describe("pickRepresentativeBatch — latest lot for the card (D-01)", () => {
  it("returns null for an empty list", () => {
    expect(pickRepresentativeBatch([])).toBeNull();
  });

  it("picks the latest by ready_for_sale_date (desc)", () => {
    const batches = [
      { ready_for_sale_date: "2026-01-10", created_at: "2026-01-01T00:00:00Z" },
      { ready_for_sale_date: "2026-03-20", created_at: "2026-01-01T00:00:00Z" },
      { ready_for_sale_date: "2026-02-15", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(pickRepresentativeBatch(batches)?.ready_for_sale_date).toBe("2026-03-20");
  });

  it("orders nulls last — a dated batch beats a null-dated one", () => {
    const batches = [
      { ready_for_sale_date: null, created_at: "2026-06-01T00:00:00Z" },
      { ready_for_sale_date: "2026-01-05", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(pickRepresentativeBatch(batches)?.ready_for_sale_date).toBe("2026-01-05");
  });

  it("returns a null-dated batch only when it is the only one", () => {
    const batches = [{ ready_for_sale_date: null, created_at: "2026-06-01T00:00:00Z" }];
    expect(pickRepresentativeBatch(batches)?.created_at).toBe("2026-06-01T00:00:00Z");
  });

  it("tie-breaks equal ready_for_sale_date by created_at (desc)", () => {
    const batches = [
      { ready_for_sale_date: "2026-03-01", created_at: "2026-01-01T00:00:00Z" },
      { ready_for_sale_date: "2026-03-01", created_at: "2026-02-01T00:00:00Z" },
    ];
    expect(pickRepresentativeBatch(batches)?.created_at).toBe("2026-02-01T00:00:00Z");
  });
});

describe("deriveTerpPercent — sum of a batch's terpene rows (D-01)", () => {
  it("returns null when the batch is null", () => {
    expect(deriveTerpPercent(null)).toBeNull();
  });

  it("returns null when the batch has no terpene rows", () => {
    expect(deriveTerpPercent({ batch_terpene: [] })).toBeNull();
    expect(deriveTerpPercent({ batch_terpene: null })).toBeNull();
  });

  it("sums the terpene percents, rounded to 2dp", () => {
    const batch = {
      batch_terpene: [{ percent: 0.51 }, { percent: 1.24 }, { percent: 0.3 }],
    };
    expect(deriveTerpPercent(batch)).toBe(2.05);
  });

  it("rounds a repeating sum to 2dp", () => {
    const batch = { batch_terpene: [{ percent: 0.111 }, { percent: 0.111 }, { percent: 0.111 }] };
    expect(deriveTerpPercent(batch)).toBe(0.33);
  });

  it("ignores null percents in the rows", () => {
    const batch = { batch_terpene: [{ percent: 1.5 }, { percent: null }, { percent: 0.5 }] };
    expect(deriveTerpPercent(batch)).toBe(2);
  });
});
