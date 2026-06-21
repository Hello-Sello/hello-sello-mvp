import { ArrowLeft } from "lucide-react";
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
}: {
  deal: DealCardView;
  /** return straight to the chat (D-03); the route owns the overlay-close */
  onClose: () => void;
}) {
  const { card, sellerName, buyerName, viewerSide } = deal;

  // the company shown in the bar is the COUNTERPARTY (the other side of the
  // deal): the viewer's own company is implicit, so naming the other party reads
  // best. viewerSide null (no company) falls back to the seller name.
  const counterpartyName = viewerSide === "seller" ? buyerName : sellerName;

  const dealName = card.hs_deal_number ?? "Deal";
  const price =
    card.value_net != null ? formatMoney(Number(card.value_net), card.currency) : null;

  return (
    <div className="glass flex shrink-0 items-center gap-3 rounded-3xl px-3 py-2">
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

      {/* deal identity inline: deal name -> company name -> price */}
      <span className="truncate text-sm font-bold tracking-wide text-ink">{dealName}</span>
      <span className="hidden truncate text-[11px] text-ink/45 sm:inline">{counterpartyName}</span>
      {price && (
        <span className="hidden shrink-0 text-[13px] font-bold tabular-nums text-ink md:inline">
          {price}
        </span>
      )}

      {/* the lifecycle pill, pushed RIGHT */}
      <div className="ml-auto shrink-0">
        <LifecyclePill status={card.status} />
      </div>
    </div>
  );
}

/**
 * Draft -> Confirmed -> Done. Display-only today; Plan 04 makes it interactive
 * (shine on "Confirmed" when all stages are done -> "Is the deal done?" confirm
 * -> finalizeDeal -> Done). Kept as a named sub-component so Plan 04 extends it.
 */
function LifecyclePill({ status }: { status: DealCardStatus }) {
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
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              i === idx
                ? "bg-brand font-medium text-white"
                : i < idx
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-ink/5 text-ink/40"
            }`}
          >
            {i < idx ? "✓ " : ""}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-[10px] text-ink/25">→</span>}
        </span>
      ))}
    </div>
  );
}
