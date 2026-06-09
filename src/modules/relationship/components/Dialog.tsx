"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * The app's progressive-disclosure dialog (screen ③ box → dialog): a blurred
 * backdrop with a solid card - open → read → close, like the Claude settings
 * modal. Closes on the X, a backdrop click, or Escape. The third reuse of this
 * grammar (deal-card flip, deals list, box → detail), which is what makes the
 * product feel like one system.
 */
export function Dialog({
  open,
  onClose,
  width = "max-w-lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Tailwind max-w-* for the card; defaults to a reading width. */
  width?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative max-h-[88vh] w-full ${width} overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-ink/50 transition hover:bg-black/10 hover:text-ink"
        >
          <X size={14} strokeWidth={2} />
        </button>
        {children}
      </div>
    </div>
  );
}
