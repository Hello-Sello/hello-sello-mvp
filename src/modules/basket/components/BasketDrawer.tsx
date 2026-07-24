"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, FileText } from "lucide-react";
import { useBasket } from "../BasketProvider";
import { updateBasketLinePackCount, removeBasketLine } from "../supabase/writes";
import { createBasketDraft } from "../actions";
import { RecipientPicker } from "./RecipientPicker";
import { dealChatUrl, getMyDraftDeals, type DraftDealRow } from "@/modules/deals";
import type { BasketGroup } from "../types";

/**
 * The compact dropdown that replaced the full-height slide-in drawer (locked
 * design: prototypes/basket-popover-prototype). Rendered by TopBar INSIDE the
 * `relative` wrapper around the basket icon, so the `absolute` positioning
 * below anchors directly to that icon - no portal, no getBoundingClientRect
 * math, just CSS. TopBar owns the open/close toggle + the click-catcher
 * backdrop (mirrors ConversationList's `NewMenu`, the closest existing analog
 * for "small anchored dropdown under a trigger button"); this component only
 * renders the panel and returns null while closed.
 *
 * D-14: the drawer has TWO sides - Product Basket (the existing persistent
 * products, no recipient needed) | Deal Basket (unsent draft deal cards from
 * BOTH doors). The toggle lives fully inside this panel, so TopBar's trigger
 * needed no change.
 */
export function BasketDrawer() {
  const { view, open, setOpen, refresh } = useBasket();
  // The active side + the Deal Basket rows. Hooks sit ABOVE the early return
  // (rules of hooks); the drafts fetch only runs while the Deal Basket side is
  // actually showing. null = not yet loaded (vs [] = loaded, empty).
  const [side, setSide] = useState<"products" | "deals">("products");
  const [drafts, setDrafts] = useState<DraftDealRow[] | null>(null);

  useEffect(() => {
    if (!open || side !== "deals") return;
    let alive = true;
    getMyDraftDeals()
      .then((rows) => {
        if (alive) setDrafts(rows);
      })
      .catch((e) => {
        console.error("deal basket: drafts fetch failed", e);
        if (alive) setDrafts([]);
      });
    return () => {
      alive = false;
    };
  }, [open, side]);

  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="Your basket"
      className="glass-strong absolute right-0 top-[calc(100%+10px)] z-50 w-80 max-w-[92vw] rounded-2xl p-3.5 shadow-2xl"
    >
      {/* caret pointing back up at the icon - two edges only (top+left) so the
          panel's own opaque background covers the overlapping half, per the
          locked prototype's `.pop::before`. */}
      <span
        aria-hidden
        className="absolute -top-[6px] right-3.5 h-3 w-3 rotate-45 border-l border-t border-white/70 bg-white"
      />

      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <h2 className="text-sm font-bold text-ink">Your basket</h2>
        {side === "products" && (
          <span className="text-xs text-ink/50">
            · {view.groups.length} {view.groups.length === 1 ? "shop" : "shops"}
          </span>
        )}
      </div>

      {/* D-14: the two-side toggle - a quiet segmented control */}
      <div className="mb-2 flex rounded-lg bg-ink/5 p-0.5" role="tablist" aria-label="Basket sides">
        <button
          role="tab"
          aria-selected={side === "products"}
          onClick={() => setSide("products")}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${side === "products" ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
        >
          Product Basket
        </button>
        <button
          role="tab"
          aria-selected={side === "deals"}
          onClick={() => setSide("deals")}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${side === "deals" ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
        >
          Deal Basket
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {side === "products" ? (
          view.groups.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink/45">Your basket is empty.</p>
          ) : (
            view.groups.map((g) => (
              <Group
                key={g.sellerCompanyId}
                group={g}
                onChanged={refresh}
                onDrafted={() => setOpen(false)}
              />
            ))
          )
        ) : (
          <DraftList drafts={drafts} onOpened={() => setOpen(false)} />
        )}
      </div>
    </div>
  );
}

/** A short "Updated 3d ago" hint from an ISO timestamp (mirrors DealPin's). */
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The Deal Basket side (D-14, deliberately MINIMAL per the deferred-ideas
 * rule - richer tab features land with the deals-on-Home pass): the viewer's
 * unsent drafts, RLS-scoped by the D-08 narrow so the list is always "my
 * company's drafts" with no app-side filter. Clicking a row opens the born
 * card the SAME way the create flow does (dealChatUrl -> ChatView re-fires
 * hs:open-deal-card for the routed card).
 */
function DraftList({
  drafts,
  onOpened,
}: {
  drafts: DraftDealRow[] | null;
  onOpened: () => void;
}) {
  const router = useRouter();

  if (drafts === null) {
    return <p className="py-8 text-center text-xs text-ink/45">Loading drafts…</p>;
  }
  if (drafts.length === 0) {
    return <p className="py-8 text-center text-xs text-ink/45">No drafts yet.</p>;
  }
  return (
    <>
      {drafts.map((d) => (
        <button
          key={d.id}
          onClick={() => {
            onOpened();
            router.push(dealChatUrl(d.relationshipId, d.id));
          }}
          className="flex w-full items-center gap-2 border-b border-ink/10 py-2.5 text-left last:border-0"
        >
          <FileText size={14} className="shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">
              {d.counterpartyName ?? "Unknown company"}
            </span>
            <span className="block text-[10px] text-ink/50">
              {d.dealType === "offer" ? "Offer" : "Order"} · Updated {timeAgo(d.updatedAt)}
            </span>
          </span>
          {/* the grey private-draft badge - same shape as DealPin's (D-15) */}
          <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
            Draft
          </span>
        </button>
      ))}
    </>
  );
}

function Group({
  group,
  onChanged,
  onDrafted,
}: {
  group: BasketGroup;
  onChanged: () => Promise<void>;
  onDrafted: () => void;
}) {
  const router = useRouter();
  const [recipient, setRecipient] = useState<{ relationshipId: string; counterpartyPersonId: string | null } | null>(
    group.isOwnCompany ? null : (group.relationshipId ? { relationshipId: group.relationshipId, counterpartyPersonId: null } : null),
  );
  const [creating, setCreating] = useState(false);
  // Mirrors DecisionBar.run(): a local error line so a failed birth surfaces in
  // the panel instead of vanishing into an unhandled rejection (WR-06).
  const [error, setError] = useState<string | null>(null);

  // Births the PRIVATE draft (status 'unsent'), then lands the viewer on the
  // born card - the drawer never sends (D-12: delivery is send_deal's alone,
  // fired later from the card's DecisionBar). The RecipientPicker still runs
  // BEFORE birth: the picked person persists in deal_card.metadata via the
  // slim birth RPC and routes the eventual send. Card open reuses the same
  // mechanism as the connect host: hs:deal-updated refreshes any mounted deal
  // UI, then dealChatUrl lands on the relationship's chat where ChatView
  // re-fires hs:open-deal-card for the born card.
  async function draft() {
    if (!recipient) return;
    setCreating(true);
    setError(null);
    try {
      const { dealCardId } = await createBasketDraft(group, {
        relationshipId: recipient.relationshipId,
        counterpartyPersonId: recipient.counterpartyPersonId,
        note: null,
      });
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
      );
      await onChanged();
      onDrafted();
      router.push(dealChatUrl(recipient.relationshipId, dealCardId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border-b border-ink/10 py-3 last:border-0 last:pb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm font-bold text-ink">{group.sellerCompanyName}</span>
        {group.isOwnCompany && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-deep">Your shop</span>}
        <span className="ml-auto text-xs text-ink/50">{group.lines.length}</span>
      </div>

      {group.lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{l.productName}</p>
            <p className="text-[10px] text-ink/50">
              {[l.cultivar, l.packSizeGrams ? `${l.packSizeGrams}g pack` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)]">
            <button aria-label="Decrease" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, Math.max(1, l.packCount - 1)); await onChanged(); }}>
              <Minus size={12} />
            </button>
            <span className="min-w-8 text-center text-[11px] font-bold tabular-nums">{l.packCount}</span>
            <button aria-label="Increase" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, l.packCount + 1); await onChanged(); }}>
              <Plus size={12} />
            </button>
          </div>
          <button aria-label="Remove" className="text-ink/40 hover:text-rose-600"
            onClick={async () => { await removeBasketLine(l.id); await onChanged(); }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {group.isOwnCompany && (
        <div className="mt-2">
          <RecipientPicker onPick={setRecipient} />
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      <button
        disabled={!recipient || creating}
        onClick={draft}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-40"
      >
        <FileText size={13} /> Create a draft deal
      </button>
    </div>
  );
}
