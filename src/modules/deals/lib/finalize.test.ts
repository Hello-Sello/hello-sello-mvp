/**
 * Unit tests for the finalization GATE (Phase 7, D-27/D-28).
 *
 * The Stages finalize gate (allStagesDone / canFinalizeFromStatus) is RETIRED
 * with Stages (D-15). D-27 replaces it: the SELLER uploading a real invoice PDF is
 * the ONE close trigger. The load-bearing PURE decision is `canFinalizeByInvoice`
 * - "an AGREED deal with a seller invoice may close" - so it is unit-tested here.
 *
 * `finalizeDeal` itself stays integration-heavy (it loads the card + relationship,
 * derives the seller, and checks for a seller-uploaded invoice) and is exercised
 * e2e in 07-08 against the local DB; this file locks only the gate decision.
 */
import { describe, it, expect } from "vitest";
import { canFinalizeByInvoice } from "./finalize";
import type { DealCardStatus } from "../types";

describe("canFinalizeByInvoice (the D-27 invoice close gate)", () => {
  it("BLOCKS a non-agreed deal even with an invoice (never close a draft)", () => {
    // a draft was never confirmed by both sides - an invoice must not skip the gate.
    expect(canFinalizeByInvoice("draft", true)).toBe(false);
  });

  it("BLOCKS an agreed deal with NO seller invoice", () => {
    // agreed but nothing uploaded - the close trigger has not fired.
    expect(canFinalizeByInvoice("confirmed", false)).toBe(false);
  });

  it("ALLOWS a confirmed deal with a seller invoice", () => {
    expect(canFinalizeByInvoice("confirmed", true)).toBe(true);
  });

  it("ALLOWS an amended deal with a seller invoice", () => {
    // `amended` is the other live agreed state (a committed two-sided change).
    expect(canFinalizeByInvoice("amended", true)).toBe(true);
  });

  it("BLOCKS a deal that is already done (terminal; idempotency handled upstream)", () => {
    expect(canFinalizeByInvoice("done", true)).toBe(false);
  });

  it("BLOCKS a dead deal (withdrawn / cancelled) even with an invoice", () => {
    const dead: DealCardStatus[] = ["withdrawn", "cancelled"];
    for (const status of dead) {
      expect(canFinalizeByInvoice(status, true)).toBe(false);
    }
  });
});
