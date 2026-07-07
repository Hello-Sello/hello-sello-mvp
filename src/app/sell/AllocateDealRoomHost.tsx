"use client";

import { useEffect, useState } from "react";
import { DealWorkspace } from "@/modules/deals";
import { DealChat } from "@/modules/messaging";

/**
 * Deal Room overlay host — the Sell-surface twin of
 * `src/app/connect/DealRoomOverlayHost.tsx` (Task 2, 260707-0ob plan 2).
 *
 * A deliberate, documented duplication of a thin ~30-line glue component (NOT
 * the real Deal Room UI, which stays single-sourced in `@/modules/deals`).
 * Reaching into Ayush's Connect-lane file directly, or extracting a shared
 * host mid-build, would be a cross-lane refactor outside this plan's scope;
 * this instead speaks the IDENTICAL `hs:open-deal-room` window-event contract
 * (same event name, same close semantics) so a row click on the Orders table
 * opens the exact same `DealWorkspace` the Connect surface already uses.
 *
 * Mount this once on the Sell page (Plan 4); it renders nothing until a row
 * dispatches `hs:open-deal-room`.
 */
export function AllocateDealRoomHost() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) setOpenCardId(id);
    }
    window.addEventListener("hs:open-deal-room", onOpen);
    return () => window.removeEventListener("hs:open-deal-room", onOpen);
  }, []);

  function closeRoom() {
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
