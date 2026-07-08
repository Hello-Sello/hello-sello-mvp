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
 * Deal card overlay host — the Sell-surface twin of
 * `src/app/connect/DealCardPanelHost.tsx` (Phase 7 retired the Deal Room +
 * Stages, D-15/D-17; this host mounts ONLY the flip `DealCard`, never a
 * container). Sell's page is a plain single-column scroll (not Connect's
 * flex-split layout), so this keeps the overlay presentation the old
 * `AllocateDealRoomHost` used rather than adopting the in-flow 50/50 panel.
 *
 * Speaks the IDENTICAL `hs:open-deal-card` window-event contract his host
 * listens for, so a row click on the Orders table opens the same real
 * `DealCard` the Connect surface uses — same data, same fetch shape.
 */
export function AllocateDealCardHost() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);
  const [things, setThings] = useState<ThingView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [people, setPeople] = useState<MemberView[]>([]);
  const [viewerPersonId, setViewerPersonId] = useState<string | null>(null);
  const [viewerCompanyId, setViewerCompanyId] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) setOpenCardId(id);
    }
    window.addEventListener("hs:open-deal-card", onOpen);
    return () => window.removeEventListener("hs:open-deal-card", onOpen);
  }, []);

  // mirrors DealCardPanelHost's fetch: the card, then its workspace's flat
  // Things + assignable roster in parallel; reset up front so a fast
  // close/reopen never flashes the previous card's data.
  useEffect(() => {
    let alive = true;
    void (async () => {
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

  function closeCard() {
    setOpenCardId(null);
  }

  // close on Escape - the keyboard mirror of the backdrop click
  useEffect(() => {
    if (!openCardId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenCardId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCardId]);

  if (!openCardId) return null;

  return (
    // a right-side panel beside the page content, matching Connect's
    // DealCardPanelHost - no backdrop, no blur, the page underneath stays
    // visible and interactive; only the card itself floats above it.
    <div className="fixed inset-y-2 right-2 z-50 w-full max-w-xl">
      <div className="glass-strong h-full overflow-y-auto rounded-3xl p-3 shadow-2xl">
        {data ? (
          <DealCard
            key={openCardId}
            data={data}
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId}
            onClose={closeCard}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink/40">
            Loading deal card…
          </div>
        )}
      </div>
    </div>
  );
}
