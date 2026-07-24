/**
 * Unit tests for the draft-edit commit-path logic (Wave 3b, Region C, CR-02).
 *
 * A proposer's "Send / Save" on the deal card does one of four things, decided
 * purely from three facts - the card status, whether a change is held, and
 * whether the viewer proposed that held change:
 *
 *   unsent                         -> draft-update (edit the private draft in place)
 *   negotiation + no held change   -> propose      (stage a new held change)
 *   negotiation + MY held change   -> replace      (withdraw then re-propose)
 *   negotiation + THEIR held change-> blocked      (I cannot edit their change)
 *
 * `canProposerEdit` is the pencil gate: the same rule that decides whether the
 * edit affordance is even offered. Extracting both to pure functions keeps the
 * load-bearing matrix testable without React or the DB, the same discipline as
 * `decisionBar.ts`'s negotiationDecision. The RED state: `./draftEdit` does not
 * exist yet, so the import throws module-not-found.
 */
import { describe, it, expect } from "vitest";
import { resendAction, canProposerEdit } from "./draftEdit";
import type { PendingChangeView } from "../types";

/** A complete held change; only its truthiness matters to these pure functions. */
function held(): PendingChangeView {
  return {
    dealCardId: "d1",
    source: "manual",
    summary: "a deal",
    lines: [],
    currency: "EUR",
    myVote: "accept",
    otherVote: null,
    iProposed: true,
    baseVersion: 1,
    proposerReason: "reason",
  };
}

describe("resendAction (which commit path a Send takes)", () => {
  it("unsent -> draft-update (edit the private draft in place, held change or not)", () => {
    expect(resendAction("unsent", null, false)).toBe("draft-update");
    expect(resendAction("unsent", held(), true)).toBe("draft-update");
  });

  it("negotiation with no held change -> propose", () => {
    expect(resendAction("negotiation", null, false)).toBe("propose");
  });

  it("negotiation + my OWN held change -> replace (withdraw then re-propose)", () => {
    expect(resendAction("negotiation", held(), true)).toBe("replace");
  });

  it("negotiation + the OTHER side's held change -> blocked", () => {
    expect(resendAction("negotiation", held(), false)).toBe("blocked");
  });
});

describe("canProposerEdit (whether the Edit pencil is offered)", () => {
  it("allows editing an unsent private draft", () => {
    expect(canProposerEdit("unsent", null, false)).toBe(true);
  });

  it("allows editing in negotiation with NO held change", () => {
    expect(canProposerEdit("negotiation", null, false)).toBe(true);
  });

  it("allows editing in negotiation when the held change is MY own", () => {
    expect(canProposerEdit("negotiation", held(), true)).toBe(true);
  });

  it("blocks editing in negotiation when the OTHER side holds the change", () => {
    expect(canProposerEdit("negotiation", held(), false)).toBe(false);
  });

  it("blocks editing once the deal is confirmed (settled)", () => {
    expect(canProposerEdit("confirmed", null, false)).toBe(false);
  });
});
