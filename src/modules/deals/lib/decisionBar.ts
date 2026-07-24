/**
 * The DecisionBar negotiation decision (Wave 3b, B6 fixed-signer, D-10).
 *
 * Pure logic, extracted from `DecisionBar.tsx` so the load-bearing "what can I do
 * next" matrix is unit-testable without React or the DB - the same discipline as
 * `finalize.ts`'s close gate. The component only RENDERS what these functions
 * return; who may Sign, who Accepts a counter, and who only waits all live here.
 *
 * Two facts drive the negotiation stage:
 *   - `iAmSigner`: the FIXED signer is the NON-initiating company (D-10). It never
 *     flips with the latest version - the same side signs for the deal's life.
 *   - `heldChange`: the pending change on the table, or null. `proposedByMe` says
 *     whether the VIEWER's company proposed it.
 *
 * Load-bearing rule: Negotiate NEVER discards a held proposal. The signer facing
 * the sender's held change still gets a plain, enabled Sign (the change survives)
 * plus a Negotiate that only opens the chat - there is no decline/discard button.
 */

/** The distinct things a DecisionBar button can do. */
export type DecisionIntent = "send" | "sign" | "accept-changes" | "withdraw" | "negotiate";

/** One rendered button's state: which action, whether it is live, and why it is not. */
export interface DecisionButton {
  intent: DecisionIntent;
  /** false = the button is shown but disabled (e.g. Sign while my own change is unaccepted). */
  enabled: boolean;
  /** true only for a disabled Sign that is waiting on the other side to accept my change. */
  waitingForAcceptance: boolean;
}

/** The whole negotiation-stage decision the bar renders (buttons + the wait line). */
export interface NegotiationDecision {
  /** true = render the "Waiting for the other side to sign." line (the sender's wait). */
  showWaitingToSignLine: boolean;
  buttons: DecisionButton[];
}

/** Small constructor so each row below reads as its intent, not a literal blob. */
function button(
  intent: DecisionIntent,
  enabled = true,
  waitingForAcceptance = false,
): DecisionButton {
  return { intent, enabled, waitingForAcceptance };
}

/**
 * The B6 negotiation matrix. `heldChange` is the pending change on the table (or
 * null); `proposedByMe` is whether the viewer's company proposed it.
 *
 *   SIGNER + own held change      -> [withdraw, sign(disabled, waiting)]  (I wait for the sender to accept)
 *   SIGNER + (none | sender's)    -> [negotiate, sign(enabled)]           (I may sign; Negotiate never discards)
 *   SENDER + signer's held change -> [negotiate, accept-changes]          (I accept the counter or keep talking)
 *   SENDER + (none | own change)  -> waiting line; [withdraw] iff my own change is held
 */
export function negotiationDecision({
  iAmSigner,
  heldChange,
}: {
  iAmSigner: boolean;
  heldChange: { proposedByMe: boolean } | null;
}): NegotiationDecision {
  if (iAmSigner) {
    if (heldChange && heldChange.proposedByMe) {
      // I am the signer but I hold my OWN change: I cannot sign it myself; I wait
      // for the sender to accept it (or I withdraw it).
      return {
        showWaitingToSignLine: false,
        buttons: [button("withdraw"), button("sign", false, true)],
      };
    }
    // No change, or the SENDER's change is on the table: I may sign right now.
    // Negotiate only opens the chat - it NEVER discards the sender's held change.
    return {
      showWaitingToSignLine: false,
      buttons: [button("negotiate"), button("sign", true)],
    };
  }
  // SENDER (the initiating side): I never sign.
  if (heldChange && !heldChange.proposedByMe) {
    // The signer countered: I accept the changes, or negotiate further.
    return {
      showWaitingToSignLine: false,
      buttons: [button("negotiate"), button("accept-changes")],
    };
  }
  // No change, or my OWN change is held: I only wait; I may withdraw my own change.
  return {
    showWaitingToSignLine: true,
    buttons: heldChange ? [button("withdraw")] : [],
  };
}

/**
 * The action set for an 'unsent' private draft. Send is always offered (the one
 * send path in the app); a stray held change also gets a Withdraw so a wedged
 * draft can be cleared (D-08 - a private draft normally has no held change).
 */
export function unsentButtons(hasPendingChange: boolean): DecisionIntent[] {
  return hasPendingChange ? ["send", "withdraw"] : ["send"];
}
