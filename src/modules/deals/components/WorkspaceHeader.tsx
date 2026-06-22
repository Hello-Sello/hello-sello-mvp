"use client";

import { useState } from "react";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { formatMoney } from "../lib/derive";
import type { DealCardStatus, DealCardView } from "../types";

/**
 * The Deal Room's slim top bar (Phase 5, D-06). ONE thin glass row - the three
 * tall tiers the old WorkspaceHeader carried (the relationship band, the
 * deal-facts row, and the one-line Deal-Sella) are GONE so the three columns
 * reclaim that vertical height.
 *
 * Read left-to-right: a top-left BACK button that returns straight to the CHAT
 * (D-02/D-03 - the old "route back through the relationship page" detour is
 * killed; this calls the `onClose` prop the route owns, never a relationship
 * Link), then the deal identity inline (deal name -> counterparty company ->
 * price), then the `LifecyclePill` pushed to the RIGHT via `ml-auto`.
 *
 * The `LifecyclePill` (Draft -> Confirmed -> Done) is KEPT verbatim - it is the
 * finalization surface Plan 04 makes interactive (the "Confirmed" segment shines
 * when all stages are done, then a "Is the deal done?" confirm flips it to Done).
 * Leave its export/shape so Plan 04 can extend it.
 */
export function WorkspaceHeader({
  deal,
  onClose,
  allStagesDone = false,
  onFinalize,
  finalizing = false,
}: {
  deal: DealCardView;
  /** return straight to the chat (D-03); the route owns the overlay-close */
  onClose: () => void;
  /** true when every tick box across all 5 stages is done (D-15) - arms the
   *  "Confirmed" segment glow; computed in DealWorkspace from getStageCompletions. */
  allStagesDone?: boolean;
  /** the finalize handler (D-16) - DealWorkspace calls finalizeDeal then re-reads
   *  the card via hs:deal-updated so the pill/gold follow the DB status. */
  onFinalize?: () => Promise<void> | void;
  /** a finalize write is in flight - disables the confirm so a double-click can't
   *  fire two finalizeDeal calls. */
  finalizing?: boolean;
}) {
  const { card, sellerName, buyerName, viewerSide } = deal;

  // the company shown in the bar is the COUNTERPARTY (the other side of the
  // deal): the viewer's own company is implicit, so naming the other party reads
  // best. viewerSide null (no company) falls back to the seller name.
  const counterpartyName = viewerSide === "seller" ? buyerName : sellerName;

  // the deal's human reference - the SAME source the strip's deal dropdown uses
  // (DealPin reads `hs_deal_number` as `hsNumber`), so the number is consistent
  // across the app. A brand-new draft has no minted number yet, so derive a short
  // stable ref from the card id (HS- + last 4, uppercased) - the center always
  // shows a number, and it flips to the real HS-#### once the deal is confirmed.
  const dealNumber =
    card.hs_deal_number ?? `HS-${card.id.replace(/-/g, "").slice(-4).toUpperCase()}`;
  const price =
    card.value_net != null ? formatMoney(Number(card.value_net), card.currency) : null;

  return (
    // `relative` so the centered title block can be absolutely centered to the BAR
    // (not to the gap between the side items), keeping it dead-centre while the
    // back button stays left and the lifecycle pill stays right.
    <div className="glass relative flex shrink-0 items-center gap-3 rounded-3xl px-3 py-2.5">
      {/* LEFT: back-to-chat + the counterparty company (collapses on small screens) */}
      <div className="flex min-w-0 items-center gap-3">
        {/* top-left BACK control - returns to the CHAT (D-02/D-03), never the
            relationship page. Corner placement modeled on DealCard's flip button. */}
        <button
          type="button"
          onClick={onClose}
          title="Back to chat"
          aria-label="Back to chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.07] bg-white/70 text-ink/55 transition hover:bg-brand-soft hover:text-brand-deep"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="hidden truncate text-[11px] text-ink/45 sm:inline">
          {counterpartyName}
        </span>
        {price && (
          <span className="hidden shrink-0 text-[13px] font-bold tabular-nums text-ink lg:inline">
            {price}
          </span>
        )}
      </div>

      {/* CENTER: the bar's identity - "Deal Room" with the deal number beneath.
          Absolutely centred to the bar; `pointer-events-none` so it never blocks
          the side controls. The "Deal Room" eyebrow is set small + tracked-out in
          the Damson maroon (the brand voice); the number is the calm hero line. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center leading-none">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-brand-deep/70">
          Deal Room
        </span>
        <span className="mt-1 text-sm font-bold tracking-wide text-ink tabular-nums">
          {dealNumber}
        </span>
      </div>

      {/* RIGHT: the lifecycle pill, pushed to the edge */}
      <div className="ml-auto shrink-0">
        <LifecyclePill
          status={card.status}
          allStagesDone={allStagesDone}
          onFinalize={onFinalize}
          finalizing={finalizing}
        />
      </div>
    </div>
  );
}

/**
 * Draft -> Confirmed -> Done - the finalization surface (D-16).
 *
 * Default behaviour is the plain progress display. INTERACTIVE when every tick
 * box across all 5 stages is done (`allStagesDone`) AND the card is not yet
 * `done`: the "Confirmed" segment GLOWS (the SellaMark shine - animate-ping halo
 * + animate-pulse) as a nudge that finalization is available, and it becomes a
 * button. Clicking it opens a small "Is the deal done?" dropdown (the DealPin
 * dropdown + outside-click click-catcher pattern); Confirm calls `onFinalize`,
 * which runs finalizeDeal in DealWorkspace -> deal_card.status='done'.
 *
 * Load-bearing rule (D-16/D-17): the click NEVER sets the pill's status locally.
 * The pill reaches "Done" + the card turns gold only after the DB re-reads as
 * `done` via the hs:deal-updated path - the gold/Done follow the DB, not the
 * click. A failed finalizeDeal therefore leaves the pill where it was.
 */
function LifecyclePill({
  status,
  allStagesDone = false,
  onFinalize,
  finalizing = false,
}: {
  status: DealCardStatus;
  allStagesDone?: boolean;
  onFinalize?: () => Promise<void> | void;
  finalizing?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const steps: ReadonlyArray<{ key: string; label: string }> = [
    { key: "draft", label: "Draft" },
    { key: "confirmed", label: "Confirmed" },
    { key: "done", label: "Done" },
  ];
  // amended is still a live confirmed deal; terminal odd states get a plain chip
  const normalized = status === "amended" ? "confirmed" : status;
  const idx = steps.findIndex((s) => s.key === normalized);
  if (idx === -1) {
    return (
      <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-[10px] font-medium capitalize text-ink/60">
        {status}
      </span>
    );
  }

  const isDone = status === "done";
  // the nudge: glow the "Confirmed" segment only when finalization is available
  // (all stages done) AND the deal is not already done.
  const canFinalize = allStagesDone && !isDone && !!onFinalize;

  async function confirmFinalize() {
    if (!onFinalize || finalizing) return;
    await onFinalize();
    // do NOT flip the pill locally - the re-read drives Done/gold (D-16). Just
    // close the dropdown; if finalize failed the pill simply stays put.
    setOpen(false);
  }

  return (
    <div className="relative flex items-center gap-1">
      {steps.map((s, i) => {
        const isConfirmedSeg = s.key === "confirmed";
        const glow = isConfirmedSeg && canFinalize;
        // the Done segment wears the amber accent when the deal is done (matches
        // the golden card); otherwise the standard active/complete/future tints.
        const segClass =
          i === idx
            ? isDone && s.key === "done"
              ? "bg-amber-100 font-medium text-amber-700"
              : "bg-brand font-medium text-white"
            : i < idx
              ? "bg-emerald-50 text-emerald-700"
              : "bg-ink/5 text-ink/40";

        const segLabel = (
          <span className="inline-flex items-center gap-1">
            {isDone && s.key === "done" && (
              <BadgeCheck className="h-3 w-3 text-amber-600" strokeWidth={2} />
            )}
            {i < idx ? "✓ " : ""}
            {s.label}
          </span>
        );

        return (
          <span key={s.key} className="relative flex items-center gap-1">
            {glow ? (
              // the GLOWING, clickable "Confirmed" segment - the finalize nudge.
              // animate-ping halo behind + animate-pulse on the chip (the
              // SellaMark shine). Clicking opens the "Is the deal done?" dropdown.
              <span className="relative inline-flex">
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-brand/40"
                />
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  title="Finalize this deal"
                  className="relative animate-pulse rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-brand-deep"
                >
                  {s.label}
                </button>
              </span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${segClass}`}>{segLabel}</span>
            )}
            {i < steps.length - 1 && <span className="text-[10px] text-ink/25">→</span>}
          </span>
        );
      })}

      {/* "Is the deal done?" dropdown (D-16) - DealPin dropdown + outside-click
          click-catcher pattern. Confirm calls onFinalize; the pill flips to Done
          only via the DB re-read, never here. */}
      {open && canFinalize && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl p-3">
            <p className="px-0.5 pb-2 text-[12px] font-semibold text-ink">Is the deal done?</p>
            <p className="px-0.5 pb-3 text-[10.5px] leading-snug text-ink/55">
              All stages are marked done. Finalizing seals the deal and turns the card golden.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={finalizing}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium text-ink/55 transition hover:bg-black/[0.04] disabled:opacity-50"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => void confirmFinalize()}
                disabled={finalizing}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60"
              >
                <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />
                {finalizing ? "Finalizing…" : "Yes, it's done"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
