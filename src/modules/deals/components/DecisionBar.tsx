"use client";

/**
 * The on-card decision bar (07-07, D-19/D-20) - the two-and-only-two actions on a
 * held pending change: **Negotiate** and **Sign the deal**. No Sella popup.
 *
 * D-20: only the NON-proposing side needs to Sign - the proposer's yes is implicit
 * in having sent the change. So:
 *   - the RESPONDER sees Negotiate (decline) + Sign the deal (accept);
 *   - the PROPOSER sees only Negotiate (withdraw) + a "waiting to be signed" note.
 *
 * The flow REUSES the existing engine VERBATIM (D-20, no new RPC):
 *   - Sign          = confirmDealChange({ decision: 'accept', reason })
 *   - Negotiate     = confirmDealChange({ decision: 'decline', reason })  (responder)
 *   - Negotiate     = withdrawDealChange({ dealCardId })                  (proposer)
 * confirmDealChange still REQUIRES a change reason (REAS-01 / Pitfall 5 - the RPC
 * raises on an empty reason), so both responder actions collect one first. The
 * busy / try-catch / re-read + `hs:deal-updated` dispatch mirrors DealPin's
 * handlers so both screens refresh live.
 */
import { useState } from "react";
import { Pencil, PenLine } from "lucide-react";
import { confirmDealChange, withdrawDealChange } from "../actions";
import type { DealCardView } from "../types";

type Pending = "sign" | "negotiate" | null;

export function DecisionBar({ data }: { data: DealCardView }) {
  const change = data.pendingChange;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // which action is capturing its required reason (responder only)
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");

  if (!change) return null;
  const dealCardId = data.card.id;

  function refresh() {
    window.dispatchEvent(
      new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
    );
  }

  // RESPONDER: Sign (accept) / Negotiate (decline) - both reason-gated (REAS-01).
  async function runDecision(decision: "accept" | "decline") {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await confirmDealChange({ dealCardId, decision, reason: reason.trim() });
      setPending(null);
      setReason("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // PROPOSER: Negotiate = withdraw the held change (no reason needed).
  async function runWithdraw() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawDealChange({ dealCardId });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // the proposer's yes is implicit (D-20): they only get Negotiate (withdraw).
  if (change.iProposed) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-ink/55">
          Waiting for the other side to sign your change.
        </p>
        {error && <p className="text-[11px] text-danger">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void runWithdraw()}
          className="dc-btn-negotiate w-full rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          {busy ? "Withdrawing…" : "Negotiate (withdraw change)"}
        </button>
      </div>
    );
  }

  // RESPONDER: the reason step, then the two buttons.
  if (pending) {
    const isSign = pending === "sign";
    return (
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-ink/70">
          {isSign ? "Add a note before you sign" : "Say why you want to keep negotiating"}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder={
            isSign
              ? "e.g. Terms look good - happy to sign."
              : "e.g. The new price still runs above our target."
          }
          className="w-full resize-none rounded-lg bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {error && <p className="text-[11px] text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPending(null);
              setReason("");
              setError(null);
            }}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => void runDecision(isSign ? "accept" : "decline")}
            className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition disabled:opacity-50 ${
              isSign
                ? "dc-btn-sign"
                : "bg-[color:var(--dc-pink)] text-white hover:bg-[color:var(--dc-pink-deep)]"
            }`}
          >
            {busy ? "Working…" : isSign ? "Sign the deal" : "Send & negotiate"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setPending("negotiate");
          }}
          className="dc-btn-negotiate flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Negotiate
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setPending("sign");
          }}
          className="dc-btn-sign flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <PenLine className="h-3.5 w-3.5" /> Sign the deal
        </button>
      </div>
    </div>
  );
}
