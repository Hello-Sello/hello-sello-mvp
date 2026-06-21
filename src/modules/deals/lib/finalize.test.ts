/**
 * Unit tests for the finalization GATE (Phase 5, D-15).
 *
 * `finalizeDeal` itself is integration-heavy (it loads the card, reads stages,
 * upserts a seal) and is verified against the LIVE local DB at apply time + a
 * Wave-2 cross-company isolation check. The one piece of PURE logic is the gate
 * decision: "every one of the deal's stages has a completion row". That decision
 * is the load-bearing rule (finalization is available ONLY when all stages are
 * marked done), so it lives in `allStagesDone` and is unit-tested here.
 */
import { describe, it, expect } from "vitest";
import { allStagesDone } from "./finalize";

describe("allStagesDone (the D-15 finalization gate)", () => {
  const FIVE = [
    "negotiation",
    "compliance_quality",
    "agreement",
    "payment",
    "fulfilment_delivery",
  ];

  it("is TRUE only when every stage has a completion row", () => {
    expect(allStagesDone(FIVE, FIVE)).toBe(true);
  });

  it("is FALSE when one stage is missing a completion row", () => {
    const allButOne = FIVE.slice(0, 4); // 'fulfilment_delivery' not done
    expect(allStagesDone(FIVE, allButOne)).toBe(false);
  });

  it("is FALSE when no stage is marked done", () => {
    expect(allStagesDone(FIVE, [])).toBe(false);
  });

  it("ignores duplicate/extra completion codes - only the stage set matters", () => {
    const withDupes = [...FIVE, "agreement", "payment"];
    expect(allStagesDone(FIVE, withDupes)).toBe(true);
  });

  it("is FALSE when there are no stages at all (nothing to finalize)", () => {
    // a deal with no stages can never be 'all done' - guards an empty-set
    // false-positive (every() over [] is vacuously true, which would be wrong).
    expect(allStagesDone([], [])).toBe(false);
  });
});
