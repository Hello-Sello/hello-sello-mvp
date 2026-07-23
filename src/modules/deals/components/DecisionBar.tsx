"use client";

/**
 * The on-card decision bar (chj/07-08) - the SINGLE bottom button area whose only
 * job is "what can I do next", driven by the deal status + who I am. It is the one
 * place the deal lifecycle surfaces to the user; only this bar changes between
 * states, never the 8-part body (the user's rule).
 *
 * Lifecycle (single-sign, the user's flow):
 *   - DRAFT: the party who did NOT give the latest version SIGNS (direct, NO reason)
 *     or Negotiates; the giver waits + can withdraw a held change. Either may Decline
 *     (= close the deal). "Give" = send a change (proposer) or, on a fresh draft with
 *     no change, create it (the initiator).
 *   - CONFIRMED (signed): editing is locked everywhere; the SELLER uploads the invoice
 *     PDF (which closes the deal), the buyer waits.
 *   - DONE (executed): one button - Open a ticket.
 *   - CANCELLED (declined) / TICKET states: a short status line, no action.
 *
 * Sign / Negotiate carry NO note (the user's rule); confirm_deal_change still needs a
 * reason string in the RPC (REAS-01), so an AUTO reason is passed silently.
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Pencil, PenLine, Ticket, Upload, X } from "lucide-react";
import {
  confirmDealChange,
  declineDeal,
  finalizeDeal,
  reopenTicket,
  signDeal,
  withdrawDealChange,
} from "../actions";
import { uploadDealInvoice } from "../supabase/writes";
import type { DealCardView } from "../types";

// confirm_deal_change requires a non-empty reason (REAS-01); the user wants no note
// UI, so Negotiate passes this silently.
const AUTO_REASON = "Updated on the card";

export function DecisionBar({
  data,
  workspaceId,
}: {
  data: DealCardView;
  /** the deal_workspace_id - needed for the seller's invoice upload (confirmed state). */
  workspaceId?: string | null;
}) {
  const dealCardId = data.card.id;
  const status = data.card.status;
  const change = data.pendingChange;
  const isSeller = data.viewerSide === "seller";
  // the deal's INITIATOR (who gave the first version): the seller for an 'offer',
  // the buyer for an 'order'. Tells us who signs a fresh draft with no held change.
  const dealType = (data.card as { deal_type?: string }).deal_type;
  const iInitiated =
    (dealType === "offer" && isSeller) || (dealType === "order" && !isSeller);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    window.dispatchEvent(new CustomEvent("hs:deal-updated", { detail: { dealCardId } }));
  }
  // one runner for every action: busy-guard, error capture, refresh on success.
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setConfirmDecline(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // the common frame: the glass footer + a shared error line above the buttons.
  function shell(children: ReactNode) {
    return (
      <div className="dc-decision px-4 pb-3.5 pt-3.5">
        <div className="flex flex-col gap-2">
          {error && <p className="text-[11px] text-danger">{error}</p>}
          {children}
        </div>
      </div>
    );
  }

  // the red "end the deal" control (two-step confirm) - shown in the draft states.
  const declineControl = confirmDecline ? (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-danger/5 px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-danger">End this deal?</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConfirmDecline(false)}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => declineDeal({ dealCardId }))}
          className="rounded-md bg-danger px-2.5 py-1 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Closing…" : "Decline deal"}
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setError(null);
        setConfirmDecline(true);
      }}
      className="flex items-center justify-center gap-1 self-center text-[11px] font-semibold text-danger/80 transition hover:text-danger disabled:opacity-50"
    >
      <X className="h-3 w-3" /> Decline deal
    </button>
  );

  // ---- DONE (executed): the single "Open a ticket" button ----
  if (status === "done") {
    return shell(
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => reopenTicket({ dealCardId }))}
        className="dc-btn-sign flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
      >
        <Ticket className="h-3.5 w-3.5" /> {busy ? "Opening…" : "Open a ticket"}
      </button>,
    );
  }
  if (status === "ticket_created") {
    return shell(
      <p className="text-center text-[12px] font-medium text-ink/55">A ticket is open on this deal.</p>,
    );
  }
  if (status === "ticket_closed") {
    return shell(
      <p className="text-center text-[12px] font-medium text-ink/55">The ticket on this deal is closed.</p>,
    );
  }
  // ---- CANCELLED (declined) ----
  if (status === "cancelled") {
    return shell(
      <p className="text-center text-[12px] font-medium text-ink/55">This deal was declined.</p>,
    );
  }

  // ---- CONFIRMED / AMENDED (signed): seller uploads the invoice, buyer waits ----
  if (status === "confirmed" || status === "amended") {
    if (!isSeller) {
      return shell(
        <p className="text-center text-[12px] font-medium text-ink/55">
          Signed. Waiting for the seller to upload the invoice.
        </p>,
      );
    }
    async function onInvoice(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = ""; // let the same file re-fire a change
      if (!file) return;
      if (!workspaceId) {
        setError("The deal workspace is still loading - try again in a moment.");
        return;
      }
      // the seller's upload itself closes the deal (uploadDealInvoice -> finalizeDeal).
      await run(async () => {
        await uploadDealInvoice({ workspaceId, dealCardId, file });
        await finalizeDeal({ dealCardId });
      });
    }
    return shell(
      <>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onInvoice} />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="dc-btn-sign flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload the invoice PDF"}
        </button>
        <p className="text-center text-[10.5px] text-ink/40">
          Signed - uploading the invoice closes the deal.
        </p>
      </>,
    );
  }

  // ---- DRAFT (negotiation / initial): the sign / negotiate / decline stage ----
  // who signs? the party who did NOT give the latest version.
  const iGaveLatest = change ? change.iProposed : iInitiated;
  if (iGaveLatest) {
    // I gave it -> I wait. I can withdraw a held change or Decline.
    return shell(
      <>
        <p className="text-[11px] text-ink/55">Waiting for the other side to sign.</p>
        {change && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => withdrawDealChange({ dealCardId }))}
            className="dc-btn-negotiate w-full rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {busy ? "Withdrawing…" : "Withdraw changes"}
          </button>
        )}
        {declineControl}
      </>,
    );
  }
  // I'm the signer: Sign (direct, NO reason). If a change is held, Negotiate discards
  // it (back to editable). Either way, Decline closes the deal.
  return shell(
    <>
      <div className="flex items-center gap-2">
        {change && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => confirmDealChange({ dealCardId, decision: "decline", reason: AUTO_REASON }))
            }
            className="dc-btn-negotiate flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Negotiate
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => signDeal({ dealCardId }))}
          className="dc-btn-sign flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <PenLine className="h-3.5 w-3.5" /> {busy ? "Signing…" : "Sign the deal"}
        </button>
      </div>
      {declineControl}
    </>,
  );
}
