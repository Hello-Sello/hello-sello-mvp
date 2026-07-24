/**
 * Unit contract for the relationship bucket rule (Phase-12 vocabulary sweep,
 * 12-06). House style: vitest, pure functions, no Supabase, no React.
 *
 * Pins the Phase-12 bucket mapping: `unsent` (the private draft) lands in
 * "active" - the SAME bucket the retired 'draft' status used - and the retired
 * 'withdrawn' arm is gone (those rows were backfilled to 'cancelled', D-18).
 */
import { describe, it, expect } from "vitest";
import { bucketOf } from "./stats";

describe("bucketOf (the Deals-tab filter buckets, Phase-12 vocabulary)", () => {
  it("unsent (private draft) → active - the bucket the old 'draft' used", () => {
    // creator-only visibility: RLS hides unsent rows from the counterparty, so
    // this bucket never leaks a draft across (D-08/D-16).
    expect(bucketOf("unsent")).toBe("active");
  });

  it("negotiation (sent, bargaining) → active", () => {
    expect(bucketOf("negotiation")).toBe("active");
  });

  it("confirmed → active", () => {
    expect(bucketOf("confirmed")).toBe("active");
  });

  it("done → old", () => {
    expect(bucketOf("done")).toBe("old");
  });

  it("cancelled → cancelled (also covers backfilled ex-'withdrawn' rows, D-18)", () => {
    expect(bucketOf("cancelled")).toBe("cancelled");
  });

  it("reopened ticket states stay in active", () => {
    expect(bucketOf("ticket_created")).toBe("active");
    expect(bucketOf("ticket_closed")).toBe("active");
  });
});
