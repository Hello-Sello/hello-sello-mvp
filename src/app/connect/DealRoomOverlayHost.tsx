"use client";

import { useEffect, useState } from "react";
import { DealWorkspace } from "@/modules/deals";
import { DealChat } from "@/modules/messaging";

/**
 * Deal Room overlay host (Phase 5, D-01/D-02/D-03) - the ROUTE-LEVEL composition
 * root for the Deal Room overlay. Mounted once in the Connect layout so it covers
 * every Connect page (the chat lives at /connect/chat, the deep-link at
 * /connect/deal/[id]); whichever page is showing, the strip's "Deal Room" button
 * can open the Room over it.
 *
 * ACYCLIC by design: this is the ONE place that composes deals' `DealWorkspace`
 * (the container) with messaging's `DealChat` (the chat slot). Neither module
 * imports the other - the strip (DealPin) only DISPATCHES a window event
 * (`hs:open-deal-room`), and this host LISTENS and mounts. So messaging never
 * back-imports deals' overlay and deals never imports messaging; the coupling
 * stays at the route, exactly like the deal page does (page.tsx). The window
 * event mirrors the app's existing `hs:deal-updated` / `hs:create-deal` contract.
 *
 * `roomOpen` is pure UI state - it grants no data access. Every read INSIDE the
 * Room still flows through the RLS-scoped reads, so the overlay only changes
 * WHERE the existing data renders, never WHAT a viewer can see.
 */
export function DealRoomOverlayHost() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) setOpenCardId(id);
    }
    window.addEventListener("hs:open-deal-room", onOpen);
    return () => window.removeEventListener("hs:open-deal-room", onOpen);
  }, []);

  // close = just hide the overlay -> the chat underneath is revealed again
  // (D-03: return straight to the chat, never route through the relationship page).
  function closeRoom() {
    setOpenCardId(null);
  }

  // close on Escape - the keyboard mirror of the top-left back + the backdrop click
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
    // the FULL blurred overlay (D-01): everything behind it blurred, full space.
    // Primitives copied from the proven card overlay (DealPin): fixed inset-0
    // z-50 + a backdrop close-catcher + a glass-strong panel that hosts the Room.
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close Deal Room"
        onClick={closeRoom}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
      />
      <div className="glass-strong absolute inset-2 overflow-hidden rounded-3xl p-2">
        <DealWorkspace
          key={openCardId}
          dealCardId={openCardId}
          chat={<DealChat dealCardId={openCardId} inRoom />}
          onClose={closeRoom}
        />
      </div>
    </div>
  );
}
