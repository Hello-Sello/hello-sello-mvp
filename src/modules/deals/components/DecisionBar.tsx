"use client";

/**
 * The on-card decision bar (chj/07-08) - the SINGLE bottom button area whose only
 * job is "what can I do next", driven by the deal status + who I am. It is the one
 * place the deal lifecycle surfaces to the user; only this bar changes between
 * states, never the 8-part body (the user's rule).
 *
 * Lifecycle (single-sign, the user's flow):
 *   - UNSENT (private draft, Phase-12 D-12): only the creator's company can see the
 *     card (RLS), and the ONE action is "Send deal" - the card's Send button is the
 *     only send path in the app; sending flips the deal into negotiation.
 *   - NEGOTIATION: the FIXED signer (the NON-initiating company, D-10) SIGNS (direct,
 *     NO reason) or Negotiates; the sender waits, accepts the signer's counter, or
 *     withdraws its own held change. Either may Decline (= close the deal). The
 *     signer never flips with the latest version - the same side signs for life
 *     (the pure B6 matrix lives in lib/decisionBar.negotiationDecision).
 *   - CONFIRMED (signed): editing is locked everywhere; the SELLER uploads the invoice
 *     PDF (which closes the deal), the buyer waits.
 *   - DONE (executed): one button - Open a ticket.
 *   - CANCELLED (declined) / TICKET states: a short status line, no action.
 *
 * Sign / Negotiate carry NO note (the user's rule); confirm_deal_change still needs a
 * reason string in the RPC (REAS-01), so an AUTO reason is passed silently.
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, PenLine, Send, Ticket, Upload, X } from "lucide-react";
import {
  confirmDealChange,
  declineDeal,
  finalizeDeal,
  reopenTicket,
  requestNegotiation,
  sendDeal,
  signDeal,
  withdrawDealChange,
} from "../actions";
import { uploadDealInvoice } from "../supabase/writes";
import { dealChatUrl } from "../lib/dealChatUrl";
import { negotiationDecision, unsentButtons, type DecisionButton } from "../lib/decisionBar";
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
  // the OTHER company's name, for the "Waiting for <them>'s acceptance" line.
  const otherName = isSeller ? data.buyerName : data.sellerName;
  // the deal's INITIATOR (who gave the first version) - the STORED fact (D-10):
  // `initiating_company_id`, selected by getDealCard, compared against the
  // viewer's company. The view carries no viewer company id, but sellerCompanyId
  // + viewerSide pin it without a new read: the initiator sits on the seller
  // side iff initiating_company_id === sellerCompanyId.
  const initiatorSide =
    data.card.initiating_company_id === data.sellerCompanyId ? "seller" : "buyer";
  // the FIXED signer is the NON-initiating company (D-10) - it never flips with
  // the latest version, so the same side signs for the deal's whole life.
  const iAmSigner = data.viewerSide != null && initiatorSide !== data.viewerSide;

  const router = useRouter();
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

  // ---- UNSENT (private draft, D-08/D-12): the card's Send button is THE one send
  // path in the app. RLS hides an unsent card from the counterparty entirely, so
  // every viewer who can reach this branch is on the initiating (draft-owning)
  // side. Send is always offered; a stray held change also gets a Withdraw
  // (unsentButtons) so a wedged draft can be cleared - a private draft normally
  // carries no held change (edits go through update_deal_draft, not propose). The
  // negotiation-era Sign/Decline never render here (their RPCs guard on
  // 'negotiation' server-side anyway).
  if (status === "unsent") {
    const intents = unsentButtons(change != null);
    return shell(
      <>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => sendDeal(dealCardId))}
          className="dc-btn-sign flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Send deal"}
        </button>
        {intents.includes("withdraw") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => withdrawDealChange({ dealCardId }))}
            className="dc-btn-negotiate w-full rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {busy ? "Withdrawing…" : "Withdraw changes"}
          </button>
        )}
      </>,
    );
  }

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

  // ---- CONFIRMED (signed): seller uploads the invoice, buyer waits ----
  if (status === "confirmed") {
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

  // ---- NEGOTIATION (sent, bargaining): the B6 fixed-signer decision (D-10) ----
  // The signer is the NON-initiating company; the button matrix (who may Sign, who
  // Accepts a counter, who only waits) is the pure `negotiationDecision` - here we
  // only RENDER it. Negotiate NEVER discards a held change: it announces intent +
  // opens the chat, it does not decline.
  const decision = negotiationDecision({
    iAmSigner,
    heldChange: change ? { proposedByMe: change.iProposed } : null,
  });

  // Render one matrix button. Kept local so it can close over busy/run/router.
  function renderButton(b: DecisionButton): ReactNode {
    if (b.intent === "sign") {
      if (!b.enabled) {
        // my own change is held: I cannot sign it myself - wait for the sender.
        return (
          <button
            key="sign"
            type="button"
            disabled
            className="dc-btn-sign flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold opacity-50"
          >
            <PenLine className="h-3.5 w-3.5" /> Waiting for {otherName}&rsquo;s acceptance
          </button>
        );
      }
      return (
        <button
          key="sign"
          type="button"
          disabled={busy}
          onClick={() => void run(() => signDeal({ dealCardId }))}
          className="dc-btn-sign flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <PenLine className="h-3.5 w-3.5" /> {busy ? "Signing…" : "Sign the deal"}
        </button>
      );
    }
    if (b.intent === "accept-changes") {
      // the sender accepts the signer's counter - a two-sided commit (D-02).
      return (
        <button
          key="accept-changes"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              confirmDealChange({ dealCardId, decision: "accept", reason: AUTO_REASON }),
            )
          }
          className="dc-btn-sign flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Accept changes
        </button>
      );
    }
    if (b.intent === "withdraw") {
      return (
        <button
          key="withdraw"
          type="button"
          disabled={busy}
          onClick={() => void run(() => withdrawDealChange({ dealCardId }))}
          className="dc-btn-negotiate flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
        >
          {busy ? "Withdrawing…" : "Withdraw changes"}
        </button>
      );
    }
    // negotiate: announce the intent (fail-soft) then open the deal chat. It NEVER
    // discards a held change - no confirmDealChange(decline) here (D-03).
    return (
      <button
        key="negotiate"
        type="button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await requestNegotiation({ dealCardId });
            router.push(dealChatUrl(data.card.relationship_id, dealCardId));
          })
        }
        className="dc-btn-negotiate flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold disabled:opacity-50"
      >
        <Pencil className="h-3.5 w-3.5" /> Negotiate
      </button>
    );
  }

  return shell(
    <>
      {decision.showWaitingToSignLine && (
        <p className="text-[11px] text-ink/55">Waiting for the other side to sign.</p>
      )}
      {decision.buttons.length > 0 && (
        <div className="flex items-center gap-2">{decision.buttons.map(renderButton)}</div>
      )}
      {declineControl}
    </>,
  );
}
