"use client";

/**
 * Sticky "Manage shop" save bar (D-03). While the owner is editing their shop in
 * place, this bar sticks to the top-right and carries the single Save control.
 *
 * The Save button PULSES only while there are unsaved changes (`dirty`). The pulse
 * animates box-shadow only — never layout (width/margin/transform of the flow) —
 * so the button never jiggles as it pulses (Muskan's explicit "no jiggle" lock).
 * The keyframe is scoped via styled-jsx and gated behind
 * `prefers-reduced-motion: no-preference`, so a reduced-motion user gets a static
 * (still clearly-dirty) button.
 *
 * The bar renders ONLY in edit mode; the "Manage shop" entry lives in the banner.
 * Save commits the in-place edits (the parent wires `onSave` to updateShopProfile);
 * Exit discards them (with a confirm when dirty).
 */
import { Check, Loader2, X } from "lucide-react";

export function SaveBar({
  dirty,
  busy = false,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  busy?: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 -mx-1 flex items-center justify-end gap-2 px-1 py-1">
      {error && (
        <span className="mr-auto rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onDiscard}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink/75 shadow-sm hover:bg-white disabled:opacity-40"
      >
        <X size={16} /> Exit
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        data-dirty={dirty ? "true" : "false"}
        data-testid="save-changes-btn"
        className={`hs-save-btn flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-40 ${
          dirty ? "hs-save-btn--dirty" : ""
        }`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save changes
      </button>

      {/* Pulse animates box-shadow ONLY (no transform/layout) → no jiggle. Static
          under prefers-reduced-motion. */}
      <style jsx>{`
        .hs-save-btn {
          box-shadow: 0 4px 14px -4px rgba(122, 22, 56, 0.55);
        }
        @media (prefers-reduced-motion: no-preference) {
          .hs-save-btn--dirty {
            animation: hs-save-pulse 1.3s ease-in-out infinite;
          }
        }
        @keyframes hs-save-pulse {
          0%,
          100% {
            box-shadow: 0 4px 14px -4px rgba(122, 22, 56, 0.6);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(122, 22, 56, 0.22);
          }
        }
      `}</style>
    </div>
  );
}
