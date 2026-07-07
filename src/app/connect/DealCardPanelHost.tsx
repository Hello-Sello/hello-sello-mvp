"use client";

import { useEffect, useState } from "react";
import { getDealCard, DealCard, type DealCardView } from "@/modules/deals";

/**
 * Deal card panel host (Phase 7, D-31/D-32) - the ROUTE-LEVEL composition root
 * that opens a deal card as a RIGHT-SIDE panel, wherever the card is opened from
 * (a chat chip, the Relationship page, or any future page). It replaces the old
 * Phase-5 `DealRoomOverlayHost` (which mounted the now-retired `DealWorkspace` in
 * a full blurred overlay). The Deal Room + Stages are gone (D-15/D-17); this host
 * mounts ONLY the flip `DealCard`, never `DealWorkspace` and never `DealChat`.
 *
 * ACYCLIC by design: the emitter (DealPin's chip, RecordTabs' button) only
 * DISPATCHES a window event (`hs:open-deal-card` with `{ dealCardId }`) and this
 * host LISTENS + fetches + mounts. No module back-imports another; the coupling
 * stays at the route, exactly like the deal deep-link page. Mirrors the app's
 * existing `hs:deal-updated` / `hs:create-deal` window-event contract.
 *
 * `openCardId` is pure UI state - it grants no data access. The card is fetched
 * with the RLS-scoped `getDealCard`, so a non-member who forges the event reads
 * nothing (existing guarantee, unchanged). It only changes WHERE the data renders.
 *
 * D-31: while the panel is open, it dispatches `hs:deal-card-panel` with
 * `{ open }` so the chat-list rail can auto-collapse to free space (the rail's
 * listener lands with the rail rework in plan 07-05). This host owns the signal;
 * consumers subscribe - no shared store, no cross-module import.
 */
export function DealCardPanelHost() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);

  // listen for the open-card event (fired by DealPin's chip + RecordTabs' button)
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) setOpenCardId(id);
    }
    window.addEventListener("hs:open-deal-card", onOpen);
    return () => window.removeEventListener("hs:open-deal-card", onOpen);
  }, []);

  // fetch the card view when a deal is opened (RLS-scoped; same fetch DealPin uses)
  useEffect(() => {
    let alive = true;
    void (async () => {
      const d = openCardId ? await getDealCard(openCardId).catch(() => null) : null;
      if (alive) setData(d);
    })();
    return () => {
      alive = false;
    };
  }, [openCardId]);

  // D-31 - tell the rail to collapse while the panel is open, expand on close.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("hs:deal-card-panel", { detail: { open: !!openCardId } }),
    );
  }, [openCardId]);

  // close on Escape - the keyboard mirror of the backdrop click
  useEffect(() => {
    if (!openCardId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenCardId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCardId]);

  function closePanel() {
    setOpenCardId(null);
  }

  if (!openCardId) return null;

  return (
    // a right-anchored side panel (D-32): a light backdrop close-catcher + a
    // glass-strong panel pinned to the right edge, scrollable, holding the card.
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close deal card"
        onClick={closePanel}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
      />
      <div className="glass-strong absolute inset-y-2 right-2 flex w-[420px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {data ? (
            <DealCard key={openCardId} data={data} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink/40">
              Loading deal card…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
