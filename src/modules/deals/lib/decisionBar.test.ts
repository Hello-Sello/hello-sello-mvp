/**
 * Unit tests for the DecisionBar decision matrix (Wave 3b, B6 fixed-signer).
 *
 * The negotiation stage's "what can I do next" is a PURE decision - who may Sign,
 * who Accepts a counter, who only waits - driven by two facts: am I the fixed
 * signer (the non-initiating company, D-10), and whose held change (if any) is on
 * the table. Extracting it to `negotiationDecision` makes the load-bearing B6
 * matrix unit-testable without React or the DB, exactly as `canFinalizeByInvoice`
 * locks the D-27 close gate. The component (DecisionBar.tsx) only RENDERS this.
 *
 * Load-bearing rule under test: Negotiate NEVER discards a held proposal - the
 * signer facing the sender's change still gets a plain Sign (the held change is
 * preserved), never a decline/discard button.
 */
import { describe, it, expect } from "vitest";
import {
  negotiationDecision,
  unsentButtons,
  type DecisionButton,
} from "./decisionBar";

/** Pull the intents out of a button list (order preserved). */
function intents(buttons: DecisionButton[]): string[] {
  return buttons.map((b) => b.intent);
}

/** Find one button by intent (undefined when absent). */
function find(buttons: DecisionButton[], intent: string): DecisionButton | undefined {
  return buttons.find((b) => b.intent === intent);
}

describe("negotiationDecision (the B6 fixed-signer matrix)", () => {
  it("SIGNER holding their OWN change -> withdraw + a DISABLED, waiting Sign", () => {
    const d = negotiationDecision({ iAmSigner: true, heldChange: { proposedByMe: true } });
    expect(intents(d.buttons)).toEqual(["withdraw", "sign"]);
    expect(find(d.buttons, "sign")).toEqual({
      intent: "sign",
      enabled: false,
      waitingForAcceptance: true,
    });
    expect(d.showWaitingToSignLine).toBe(false);
  });

  it("SIGNER with NO held change -> negotiate + an ENABLED Sign", () => {
    const d = negotiationDecision({ iAmSigner: true, heldChange: null });
    expect(intents(d.buttons)).toEqual(["negotiate", "sign"]);
    expect(find(d.buttons, "sign")).toEqual({
      intent: "sign",
      enabled: true,
      waitingForAcceptance: false,
    });
    expect(d.showWaitingToSignLine).toBe(false);
  });

  it("SIGNER facing the SENDER's held change -> negotiate + an ENABLED Sign (change preserved)", () => {
    const d = negotiationDecision({ iAmSigner: true, heldChange: { proposedByMe: false } });
    expect(intents(d.buttons)).toEqual(["negotiate", "sign"]);
    expect(find(d.buttons, "sign")?.enabled).toBe(true);
    expect(d.showWaitingToSignLine).toBe(false);
  });

  it("SENDER facing the SIGNER's held change -> negotiate + accept-changes, no waiting line", () => {
    const d = negotiationDecision({ iAmSigner: false, heldChange: { proposedByMe: false } });
    expect(intents(d.buttons)).toEqual(["negotiate", "accept-changes"]);
    expect(d.showWaitingToSignLine).toBe(false);
  });

  it("SENDER with NO held change -> just the waiting-to-sign line, no buttons", () => {
    const d = negotiationDecision({ iAmSigner: false, heldChange: null });
    expect(d.buttons).toEqual([]);
    expect(d.showWaitingToSignLine).toBe(true);
  });

  it("SENDER holding their OWN change -> the waiting line + a single withdraw", () => {
    const d = negotiationDecision({ iAmSigner: false, heldChange: { proposedByMe: true } });
    expect(intents(d.buttons)).toEqual(["withdraw"]);
    expect(d.showWaitingToSignLine).toBe(true);
  });
});

describe("Negotiate NEVER discards a held proposal", () => {
  it("SIGNER + sender's held change offers negotiate AND sign, and NO discard/decline path", () => {
    const d = negotiationDecision({ iAmSigner: true, heldChange: { proposedByMe: false } });
    // exactly negotiate + sign - the held change survives (no 'decline'/'discard' intent).
    expect(intents(d.buttons).slice().sort()).toEqual(["negotiate", "sign"]);
    expect(find(d.buttons, "sign")?.enabled).toBe(true);
  });
});

describe("unsentButtons (the private-draft action set)", () => {
  it("offers only Send when no change is held", () => {
    expect(unsentButtons(false)).toEqual(["send"]);
  });

  it("offers Send + Withdraw when a stray change is held", () => {
    expect(unsentButtons(true)).toEqual(["send", "withdraw"]);
  });
});
