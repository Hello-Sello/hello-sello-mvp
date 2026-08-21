"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, FileText, UserPlus } from "lucide-react";
import { useBasket } from "../BasketProvider";
import {
  updateBasketLinePackCount,
  updateBasketLinePackSize,
  removeBasketLine,
} from "../supabase/writes";
import { createBasketDraft } from "../actions";
import { RecipientPicker } from "./RecipientPicker";
import { dealChatUrl, formatMoney, getMyDraftDeals, type DraftDealRow } from "@/modules/deals";
import { resolveBasketLine, type ResolvedBasketLine } from "../lib/pack";
import type { BasketGroup, BasketLine } from "../types";

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
  /** Close the drawer. Named for its first caller (a born draft), and reused by
   *  the Connect link below — every navigation out of this popover closes it
   *  first, or the panel sits over the destination. */
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
  // Per-line fail nonces for the pack-size editor: a SERVER-rejected write
  // leaves the stored value unchanged, so the input's remount key would not
  // change and the rejected value would sit in the DOM (a silent lie). Bumping
  // the line's nonce in the catch rides into the input's key → it snaps back
  // to the stored value alongside the error line.
  const [packSizeFails, setPackSizeFails] = useState<Record<string, number>>({});
  // A FOREIGN seller with no relationship: nothing can be sent to them yet, and
  // the recipient can never be filled in from this panel. `isOwnCompany` is
  // load-bearing — the seller's own group also carries a null relationshipId
  // (basket/lib/group.ts:24) and drafts fine through RecipientPicker.
  const needsConnection = !group.isOwnCompany && group.relationshipId === null;

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
        <BasketLineRow
          key={l.id}
          line={l}
          resolved={resolveBasketLine(l)}
          onPackCountChange={async (packCount) => {
            await updateBasketLinePackCount(l.id, packCount);
            await onChanged();
          }}
          packSizeResetNonce={packSizeFails[l.id] ?? 0}
          onPackSizeCommit={async (grams) => {
            // Amendment 3: the writer throws (like the pack-count writer); a
            // failed edit surfaces on the group's existing error line.
            try {
              await updateBasketLinePackSize(l.id, grams);
              await onChanged();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong.");
              setPackSizeFails((m) => ({ ...m, [l.id]: (m[l.id] ?? 0) + 1 }));
            }
          }}
          onRemove={async () => {
            await removeBasketLine(l.id);
            await onChanged();
          }}
        />
      ))}

      {group.isOwnCompany && (
        <div className="mt-2">
          <RecipientPicker onPick={setRecipient} />
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      {needsConnection ? (
        <div className="mt-2 rounded-lg bg-ink/5 p-2.5">
          <p className="text-[11px] leading-snug text-ink/60">
            A deal rides on a connection, so connecting comes first — then you can send
            this basket to {group.sellerCompanyName}.
          </p>
          {/* A real <Link>, so the shop page is a normal navigable href — but
              the drawer is a popover anchored to TopBar, so it must CLOSE
              first or it sits over the destination (the same close-then-go
              order onDrafted/onOpened already use). Next calls this onClick
              before it navigates. Landing on the page you are already on is
              the likeliest case; the close still has to happen. */}
          <Link
            href={`/discover/${group.sellerCompanyId}`}
            onClick={onDrafted}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-deep"
          >
            <UserPlus size={13} /> Connect with {group.sellerCompanyName}
          </Link>
        </div>
      ) : (
        <button
          disabled={!recipient || creating}
          onClick={draft}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-40"
        >
          <FileText size={13} /> Create a draft deal
        </button>
      )}
    </div>
  );
}

/**
 * One basket line: name, the grams/pack-size editor (decision A), the resolved
 * price note + tier chip, the pack-count stepper, and remove. PRESENTATIONAL
 * ONLY (PLAN-T06 amendment 1) — props in, callbacks out, no hooks, no supabase;
 * every number comes from the `resolved` prop (`resolveBasketLine`), so this
 * component does NO price math and the render contract stays testable under
 * `renderToStaticMarkup`.
 *
 * The pack-size input is uncontrolled (`defaultValue`, keyed on the stored
 * value so a committed edit re-mounts it fresh): Enter blurs, blur commits.
 * Invalid input (empty/NaN/≤0) reverts to the stored value without a write.
 * `packSizeResetNonce` rides into the same key: the owner bumps it when a
 * write FAILS server-side (stored value unchanged → key otherwise static), so
 * the input snaps back instead of silently showing the rejected value.
 */
export function BasketLineRow({
  line,
  resolved,
  packSizeResetNonce = 0,
  onPackCountChange,
  onPackSizeCommit,
  onRemove,
}: {
  line: BasketLine;
  resolved: ResolvedBasketLine;
  packSizeResetNonce?: number;
  onPackCountChange: (packCount: number) => void;
  onPackSizeCommit: (grams: number) => void;
  onRemove: () => void;
}) {
  const stored = line.packSizeGrams;

  function commitPackSize(e: React.FocusEvent<HTMLInputElement>) {
    const parsed = Number(e.currentTarget.value.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      e.currentTarget.value = stored == null ? "" : String(stored);
      return;
    }
    if (parsed === stored) return;
    onPackSizeCommit(parsed);
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{line.productName}</p>
          <p className="flex items-center gap-1 text-[10px] text-ink/50">
            {line.cultivar && <span className="truncate">{line.cultivar} ·</span>}
            <input
              key={`${stored ?? "unset"}:${packSizeResetNonce}`}
              type="text"
              inputMode="decimal"
              aria-label="Pack size in grams"
              defaultValue={stored ?? ""}
              placeholder="g"
              className="w-14 rounded border border-ink/15 bg-white px-1 py-px text-[10px] tabular-nums text-ink"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={commitPackSize}
            />
            <span className="shrink-0">g pack</span>
          </p>
        </div>
        <div className="flex items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)]">
          <button aria-label="Decrease" className="grid h-6 w-6 place-items-center text-brand-deep"
            onClick={() => onPackCountChange(Math.max(1, line.packCount - 1))}>
            <Minus size={12} />
          </button>
          <span className="min-w-8 text-center text-[11px] font-bold tabular-nums">{line.packCount}</span>
          <button aria-label="Increase" className="grid h-6 w-6 place-items-center text-brand-deep"
            onClick={() => onPackCountChange(line.packCount + 1)}>
            <Plus size={12} />
          </button>
        </div>
        <button aria-label="Remove" className="text-ink/40 hover:text-rose-600" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      {resolved.pricePerGram != null && (
        <p className="mt-1 flex items-center justify-end gap-1.5 text-right text-[10px] tabular-nums text-ink/60">
          <span>
            {resolved.grams != null ? (
              <>
                {line.packCount} × {line.packSizeGrams}g = <strong>{resolved.grams}g</strong>
              </>
            ) : (
              <>
                {line.packCount} {line.unit}
              </>
            )}
            {" at "}
            <strong>{formatMoney(resolved.pricePerGram, line.currency)}/g</strong>
            {resolved.lineTotal != null && (
              <>
                {" → "}
                <strong>{formatMoney(resolved.lineTotal, line.currency)}</strong>
              </>
            )}
          </span>
          {resolved.appliedMin != null ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: "#1d7a1c", background: "rgba(52,178,51,.12)" }}
            >
              from {resolved.appliedMin}g applied
            </span>
          ) : line.tiers.length > 0 ? (
            <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
              base price
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
