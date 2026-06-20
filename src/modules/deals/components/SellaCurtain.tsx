"use client";

import { Sparkles, Clock } from "lucide-react";
import { ConfirmBar } from "./ConfirmBar";
import { formatMoney } from "../lib/derive";
import type { ConfirmSeat, PartySide, PendingChangeView } from "../types";

/**
 * The Sella curtain (04A, D-07) - the animated drawer that re-homes the
 * already-wired held two-sided change flow under the `//` Sella mark.
 *
 * D-07/D-08: this REPLACES the old loud "Review change" popover (DealPin
 * ~491-572). The `//` mark is now the single entry point; clicking it drops
 * this curtain open. The curtain widens/drops with a Tailwind transition, the
 * held change unfolds inside, the user Accepts/Declines with the required
 * reason (the reused `ConfirmBar` gate) or Withdraws if they proposed it, a
 * processing animation plays, then the parent clears the change + closes the
 * curtain (the collapse transition plays - it "closes again").
 *
 * PRESENTATIONAL + DUMB (mirrors `ConfirmBar`): it makes NO server call and
 * imports NO action/read/barrel. The parent (04A-04, in `DealPin.tsx`) owns the
 * data (`data.pendingChange` from the existing read) and the real flow handlers,
 * and passes the resolved `PendingChangeView`, the change-mapped `seats`, and
 * the `onConfirm`/`onDecline`/`onWithdraw`/`onClose` callbacks down as props.
 * This curtain only DISPLAYS the change and FORWARDS those callbacks.
 *
 * D-10: open/close + processing animations are Tailwind transitions only - no
 * external motion library, no drawer primitive (none exist in the codebase).
 */
export interface SellaCurtainProps {
  /** whether the curtain is dropped open (the parent toggles this on mark click) */
  open: boolean;
  /** the resolved held change to render (from the existing read) */
  pendingChange: PendingChangeView;
  /**
   * the two seats already mapped to the CHANGE's votes by the parent (the
   * existing `changeSeats` mapping: each seat's status comes from the change
   * vote, not the seal). The reused `ConfirmBar` renders these verbatim.
   */
  seats: ConfirmSeat[];
  /** which side the viewer is on; null = an onlooker */
  viewerSide: PartySide | null;
  /** an action is in flight (the parent's `changeBusy`); drives the processing feel */
  busy: boolean;
  /** the other company's name, for the expanded "From {name} · vN → vN+1" line */
  counterpartyName?: string;
  /** forwarded from `ConfirmBar`; the parent runs the existing accept flow */
  onConfirm: (reason: string) => void;
  /** forwarded from `ConfirmBar`; the parent runs the existing decline flow */
  onDecline: (reason: string) => void;
  /** the proposer's no-reason take-back; the parent runs the existing withdraw
   *  flow. D-09: Withdraw lives INSIDE the curtain only (never on the strip). */
  onWithdraw: () => void;
  /** close the curtain (the click-catcher + the parent's after-success close) */
  onClose: () => void;
}

export function SellaCurtain({
  open,
  pendingChange,
  seats,
  viewerSide,
  busy,
  counterpartyName,
  onConfirm,
  onDecline,
  onWithdraw,
  onClose,
}: SellaCurtainProps) {
  // D-09 hybrid: derive which face to show purely from the resolved change. The
  // responder (did NOT propose, no vote yet) gets the review + reason gate; the
  // proposer sees the quiet awaiting face with the in-curtain Withdraw.
  const isReviewing = !pendingChange.iProposed && pendingChange.myVote == null;
  const isWaiting = pendingChange.iProposed;

  // The shared proposed-lines list (reused by both faces for context). Same row
  // layout as the old popover (DealPin ~523-534): name on the left, qty+unit and
  // the priced money on the right; price only when it is not null.
  const linesList = (
    <ul className="space-y-1.5">
      {pendingChange.lines.map((l, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 flex-1 truncate text-ink/80">{l.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-ink/60">
            {l.quantity}
            {l.unit}
            {l.unitPrice != null ? ` · ${formatMoney(l.unitPrice, l.currency)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* click-catcher: closes the curtain when the user clicks away (mirrors the
          old popovers' `fixed inset-0 z-10` pattern). Only mounted while open. */}
      {open && <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />}

      {/* The curtain. D-10: when closed it is collapsed (max-h-0 / opacity-0 /
          slight up-shift) and `overflow-hidden`; when open it drops/widens open
          (max-h grows, opacity-100, no shift) via `transition-all duration-300`,
          so it reads as a curtain opening from under the mark. */}
      <div
        role="dialog"
        aria-label="Sella - proposed change"
        aria-hidden={!open}
        className={`absolute right-0 top-full z-20 mt-1.5 w-80 origin-top overflow-hidden rounded-2xl transition-all duration-300 ease-out ${
          open
            ? "max-h-[36rem] translate-y-0 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-1 opacity-0"
        }`}
      >
        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="flex items-stretch">
            {/* the maroon brand-deep spine (matches the old popover's accent rail) */}
            <span className="w-1 shrink-0 bg-brand-deep" aria-hidden />

            <div className="relative min-w-0 flex-1 p-3">
              {/* D-07 processing animation (Tailwind-only): while an action is in
                  flight the body dims and a pulsing maroon bar sweeps the top, so
                  the curtain reads as "Sella is working" before it closes. */}
              {busy && (
                <span
                  className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-deep"
                  aria-hidden
                />
              )}

              <div
                className={`transition-opacity duration-200 ${busy ? "opacity-50" : "opacity-100"}`}
              >
                {/* shared header */}
                <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-brand-deep">
                  <Sparkles size={12} strokeWidth={2} />
                  {isReviewing ? "Proposed change" : "Change pending"}
                </div>
                <p className="mb-2 text-[11px] text-ink/50">
                  {`From ${counterpartyName ?? "the other side"} · v${pendingChange.baseVersion} → v${pendingChange.baseVersion + 1}`}
                </p>

                {/* the proposed lines (both faces) */}
                {linesList}

                {isReviewing && (
                  <>
                    {/* the proposer's required reason, for context (D-07) */}
                    {pendingChange.proposerReason && (
                      <p className="mt-2 border-t border-black/5 pt-2 text-[11px] text-ink/55">
                        <span className="font-semibold text-ink/70">Their reason: </span>
                        {pendingChange.proposerReason}
                      </p>
                    )}

                    {/* the REUSED reason gate (REAS-01): requireReason renders the
                        textarea and disables both buttons until it is non-blank.
                        We do NOT rebuild it - we forward Accept/Decline up. */}
                    <div className="mt-3">
                      <ConfirmBar
                        seats={seats}
                        viewerSide={viewerSide}
                        busy={busy}
                        requireReason
                        onConfirm={(reason) => onConfirm(reason ?? "")}
                        onDecline={(reason) => onDecline(reason ?? "")}
                      />
                    </div>
                  </>
                )}

                {isWaiting && (
                  /* D-09 quiet awaiting face: inside the expanded curtain we MAY
                     name the company (the width constraint is the strip's, not
                     here). Withdraw lives HERE only - never on the strip. */
                  <div className="mt-3 rounded-xl bg-white/70 p-2.5 ring-1 ring-brand/10">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink/60">
                      <Clock size={12} strokeWidth={2} className="text-brand-deep" />
                      Awaiting reply
                      {counterpartyName ? ` from ${counterpartyName}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-ink/45">
                      They will see your proposed change and Accept or Decline it.
                    </p>
                    <button
                      type="button"
                      onClick={onWithdraw}
                      disabled={busy}
                      className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5 disabled:opacity-50"
                    >
                      Withdraw change
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
