"use client";

import { useEffect, useState } from "react";
import {
  getDealCard,
  getWorkspace,
  getThings,
  getDealPeople,
  DealCard,
  type DealCardView,
  type MemberView,
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
  // Open Items' assignable people (both companies' deal members) + who the viewer
  // is, resolved from the SAME getWorkspace read - powers @mention + assign (07-07).
  const [people, setPeople] = useState<MemberView[]>([]);
  const [viewerPersonId, setViewerPersonId] = useState<string | null>(null);
  const [viewerCompanyId, setViewerCompanyId] = useState<string | null>(null);

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
    void (async () => {
      // Reset up front (inside the async body, not synchronously in the effect
      // body) so the previous card's Things never flash on the next one - and
      // without tripping react-hooks/set-state-in-effect. This still runs in the
      // same tick (before the first await), so there is no stale flash.
      setThings([]);
      setWorkspaceId(null);
      setPeople([]);
      setViewerPersonId(null);
      setViewerCompanyId(null);
      const d = openCardId ? await getDealCard(openCardId).catch(() => null) : null;
      if (alive) setData(d);
      if (!openCardId) return;

      const ws = await getWorkspace(openCardId).catch(() => null);
      const wsId = ws?.workspaceId ?? null;
      // the Things list + the assignable ROSTER (both companies' people) in
      // parallel - the roster powers Open Items' @mention + assign list.
      const [list, roster] = await Promise.all([
        wsId ? getThings(wsId).catch(() => []) : Promise.resolve([] as ThingView[]),
        getDealPeople(openCardId).catch(() => [] as MemberView[]),
      ]);
      if (alive) {
        setWorkspaceId(wsId);
        setThings(list);
        setPeople(roster);
        setViewerCompanyId(ws?.viewerCompanyId ?? null);
        setViewerPersonId(
          roster.find((m) => m.isViewer)?.personId ??
            ws?.members.find((m) => m.isViewer)?.personId ??
            null,
        );
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
    // D-32 (revised): an IN-FLOW 50/50 panel, NOT a blurred overlay. As a flex
    // sibling of the surface content (see the Connect layout), this flex-1 aside
    // shrinks the content to the other half - the chat "minimizes" and the card
    // takes the right half, no backdrop, no blur. The X closes it and the content
    // expands back; the header's deal control reopens it.
    <aside
      aria-label="Deal card"
      className="glass-strong flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl"
    >
      {/* No separate top bar - the close X now lives ON the card's own title bar
          (passed as onClose), so the panel spends no extra row on it. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {data ? (
          <DealCard
            key={openCardId}
            data={data}
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId}
            onClose={closePanel}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink/40">
            Loading deal card…
          </div>
        )}
      </div>
    </aside>
  );
}
