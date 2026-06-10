"use client";

/**
 * Deal pin (3a, Phase 5) - the deal card's home inside the chat.
 *
 * Wraps the message stream: renders the "Talking about …" bar above it and, when
 * opened, floats the DealCard on the RIGHT of the stream (prototype placement).
 * Sella stays in her own panel - the card does not swap her out.
 *
 * Self-contained: finds the relationship's current deal and loads it itself, so
 * the messaging module just wraps its stream with <DealPin>. Single deal per
 * thread for the demo (multi-deal selector deferred, DEV-37).
 */
import { useEffect, useState } from "react";
import { ChevronDown, FileText, X } from "lucide-react";
import { getCurrentDealCardId, getDealCard } from "../supabase/reads";
import { docAbbr } from "../lib/derive";
import { DealCard } from "./DealCard";
import type { DealCardView } from "../types";

export function DealPin({
  relationshipId,
  children,
}: {
  relationshipId: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<DealCardView | null>(null);
  const [open, setOpen] = useState(false);

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

  return (
    <>
      {/* "Talking about" bar - only when the relationship has a deal */}
      {data && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2">
          <span className="shrink-0 text-[11px] text-ink/45">Talking about:</span>
          {/* single deal for the demo - selector is non-interactive (multi-deal = DEV-37) */}
          <span className="flex items-center gap-1.5 rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-medium text-ink/70">
            Current deal
            <ChevronDown size={13} className="text-ink/35" />
          </span>
          <button
            onClick={() => setOpen((o) => !o)}
            className="ml-auto flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep"
          >
            <FileText size={13} />
            <span className="tracking-wide">{hsLabel}</span>
            <span className="text-white/70">{open ? "close" : "open"}</span>
            {open ? <X size={13} /> : null}
          </button>
        </div>
      )}

      {/* the stream, with the card floated on the right when open */}
      <div className="relative min-h-0 flex-1">
        {children}
        {data && open && (
          <div className="pointer-events-none absolute inset-0 z-10 flex justify-end p-4">
            <div className="pointer-events-auto self-start">
              <DealCard data={data} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
