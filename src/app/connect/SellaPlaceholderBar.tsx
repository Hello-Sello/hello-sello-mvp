"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

/**
 * Sella placeholder bar (Phase 7, D-10) - the retired inline `//` Sella mark and
 * its Accept/Decline/Reason/Withdraw curtain are BOTH gone. Sella is now ONE
 * minimal, thin bar pinned to the RIGHT EDGE of the Connect screen. It opens and
 * closes on click and has NO function yet - real Sella intelligence lands in
 * Phase 8. Pure chrome: it reads no data and grants no access (threat T-07-01-03).
 *
 * Mounted at the Connect layout next to `DealCardPanelHost` (acyclic route
 * chrome, no cross-module import), so it rides over every Connect page.
 */
export function SellaPlaceholderBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* the thin edge tab - always visible, toggles the placeholder panel */}
      <button
        type="button"
        aria-label={open ? "Close Sella" : "Open Sella"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1 rounded-l-xl bg-brand/90 py-3 pl-1.5 pr-1 text-white shadow-sm transition hover:bg-brand"
      >
        <Sparkles size={15} strokeWidth={2} />
      </button>

      {/* the placeholder panel - opens on click, no function inside yet (Phase 8) */}
      {open && (
        <div className="glass-strong fixed inset-y-2 right-2 z-40 flex w-[300px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-deep">
              <Sparkles size={15} strokeWidth={2} className="text-brand" />
              Sella
            </span>
            <button
              type="button"
              aria-label="Close Sella"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink/45 transition hover:bg-black/[0.04] hover:text-ink"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink/40">
            Sella arrives in Phase 8.
          </div>
        </div>
      )}
    </>
  );
}
