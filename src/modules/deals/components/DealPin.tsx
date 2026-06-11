"use client";

/**
 * Deal pin (3a Phase 5, reworked in 3b Phase 5) - the deal card's home inside
 * a chat. Wraps the message stream: renders the "Talking about …" bar above it
 * and, when opened, floats the DealCard on the RIGHT of the stream.
 *
 * Two variants (same card, different bar):
 *   - `chat` (default, screen ②): "Talking about: Current deal ▾" on the left
 *     (the selector concept stays - multi-deal per P2P is deferred, DEV-37),
 *     the card pill in the CENTER, and the "Deal workspace ↗" door on the
 *     right - the second locked door to screen ④.
 *   - `workspace` (screen ④): the deal is fixed here, so no selector and no
 *     workspace door (you are already in it) - just the label + the pill.
 *
 * Self-contained: finds the relationship's current deal and loads it itself,
 * so the messaging module just wraps its stream with <DealPin>.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, FileText, X } from "lucide-react";
import { getCurrentDealCardId, getDealCard } from "../supabase/reads";
import { confirmDeal } from "../actions";
import { docAbbr } from "../lib/derive";
import { DealCard } from "./DealCard";
import type { ConfirmDecision, DealCardView } from "../types";

export function DealPin({
  relationshipId,
  variant = "chat",
  children,
}: {
  relationshipId: string;
  variant?: "chat" | "workspace";
  children: React.ReactNode;
}) {
  const [data, setData] = useState<DealCardView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // 3d gate: run a confirm/decline/withdraw on the server, then re-read the card
  // so status + both seats refresh (the flip to golden happens on the re-read).
  async function runDecision(decision: ConfirmDecision) {
    if (!data || busy) return;
    setBusy(true);
    try {
      await confirmDeal({ dealCardId: data.card.id, version: data.card.version, decision });
      const fresh = await getDealCard(data.card.id);
      setData(fresh);
      // tell sibling views (the workspace header's lifecycle pill) to re-read -
      // they loaded the card separately, so a decoupled signal keeps them in sync.
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId: data.card.id } }),
      );
    } catch (e) {
      console.error("deal confirm failed", e);
    } finally {
      setBusy(false);
    }
  }

  // load the current deal for this relationship. DealPin is keyed by
  // relationshipId at the mount site, so it remounts (fresh state) per
  // relationship - no synchronous reset needed here, we only commit the result.
  useEffect(() => {
    let alive = true;
    void getCurrentDealCardId(relationshipId)
      .then((id) => (id ? getDealCard(id) : null))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [relationshipId]);

  const hsLabel =
    data?.card.hs_deal_number ?? (data ? `${docAbbr(data.card.deal_type)} · draft` : "");

  const pill = data && (
    <button
      onClick={() => setOpen((o) => !o)}
      className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep"
    >
      <FileText size={13} />
      <span className="tracking-wide">{hsLabel}</span>
      <span className="text-white/70">{open ? "close" : "open"}</span>
      {open ? <X size={13} /> : null}
    </button>
  );

  return (
    <>
      {/* "Talking about" bar - only when the relationship has a deal */}
      {data && variant === "workspace" && (
        // the workspace's chat IS this deal's chat - no selector, no door
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2">
          <span className="shrink-0 text-[11px] text-ink/45">Talking about:</span>
          {pill}
        </div>
      )}
      {data && variant === "chat" && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2">
          <span className="shrink-0 text-[11px] text-ink/45">Talking about:</span>
          {/* single deal for the demo - selector is non-interactive (multi-deal = DEV-37) */}
          <span className="flex items-center gap-1.5 rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-medium text-ink/70">
            Current deal
            <ChevronDown size={13} className="text-ink/35" />
          </span>
          {/* the card pill, centered (Ayush, 3b Phase 5) */}
          <span className="flex flex-1 justify-center">{pill}</span>
          {/* the second door to screen ④ */}
          <Link
            href={`/connect/deal/${data.card.id}`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition hover:bg-ink/10 hover:text-ink"
          >
            Deal workspace
            <ArrowUpRight size={13} strokeWidth={2} className="shrink-0" />
          </Link>
        </div>
      )}

      {/* the stream, with the card floated on the right when open */}
      <div className="relative min-h-0 flex-1">
        {children}
        {data && open && (
          <div className="pointer-events-none absolute inset-0 z-10 flex justify-end p-4">
            <div className="pointer-events-auto self-start">
              <DealCard
                data={data}
                confirm={{
                  busy,
                  onConfirm: () => void runDecision("confirm"),
                  onDecline: () => void runDecision("decline"),
                  onWithdraw: () => void runDecision("withdraw"),
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
