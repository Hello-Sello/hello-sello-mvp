"use client";

import { useEffect, useState } from "react";
import {
  getDealCard,
  getWorkspace,
  getThings,
  DealCard,
  type DealCardView,
  type ThingView,
} from "@/modules/deals";

/**
 * Deal card panel host (Phase 7, D-31/D-32) - the ROUTE-LEVEL composition root
 * that opens a deal card as a RIGHT-SIDE panel, wherever the card is opened from
 * (a chat chip, the Relationship page, or any future page). It replaces the old
 * Phase-5 Deal Room overlay host (which mounted the now-retired Deal Room
 * container in a full blurred overlay). The Deal Room + Stages are gone
 * (D-15/D-17); this host mounts ONLY the flip `DealCard`, never a container.
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
  // the Open Items source (07-07): the card's flat Things list + the workspace id
  // that lets Open Items inline-add. Default empty so the section renders even
  // before (or when) the extra reads resolve.
  const [things, setThings] = useState<ThingView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // listen for the open-card event (fired by DealPin's chip + RecordTabs' button)
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) setOpenCardId(id);
    }
    window.addEventListener("hs:open-deal-card", onOpen);
    return () => window.removeEventListener("hs:open-deal-card", onOpen);
  }, []);

  // fetch the card view when a deal is opened (RLS-scoped; same fetch DealPin uses).
  // ALSO load the workspace + its Things so Open Items renders the real list
  // (07-07). Both extra reads are wrapped so a failure only leaves Open Items
  // empty - it never blanks the card. Reset to defaults up front so the previous
  // card's Things never flash on the next one; the `alive` guard drops stale
  // results on a fast close/reopen.
  useEffect(() => {
    let alive = true;
    setThings([]);
    setWorkspaceId(null);
    void (async () => {
      const d = openCardId ? await getDealCard(openCardId).catch(() => null) : null;
      if (alive) setData(d);
      if (!openCardId) return;

      const ws = await getWorkspace(openCardId).catch(() => null);
      const wsId = ws?.workspaceId ?? null;
      const list = wsId ? await getThings(wsId).catch(() => []) : [];
      if (alive) {
        setWorkspaceId(wsId);
        setThings(list);
      }
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
            <DealCard
              key={openCardId}
              data={data}
              things={things}
              workspaceId={workspaceId}
            />
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
