"use client";

/**
 * Deal card (3a) - the card object with its FRONT and BACK.
 *
 * V3 flip (Phase 4 S2): the old CSS-3D `rotateY` flip is replaced by a CLEAN
 * CROSS-FADE - two `position:absolute; inset-0` faces toggled by opacity +
 * visibility on a `flipped` state. The 3D flip glitched in Chrome/Safari; the
 * cross-fade never does. Because both faces are absolutely positioned, the card
 * carries an explicit `min-height` so it cannot collapse (the front is the tall
 * face).
 *
 * The two corner controls live in the maroon HEADER corners (V3): flip top-left,
 * Edit top-right - ~30px round translucent-white buttons, layered above the faces
 * (z-index) so they stay visible and upright on both faces.
 *
 * PENCIL LOCK (DCHG-03): the Edit button renders only when `onEdit` is defined.
 * DealPin passes `onEdit={data.pendingChange ? undefined : ...}`, so a held change
 * hides the pencil. The Seal gate is NOT on the card - it moved to the Sella strip.
 *
 * Kept as the single card entry point so the chat placement mounts one component.
 */
import { useState } from "react";
import { FlipHorizontal2, Pencil } from "lucide-react";
import { CardFront } from "./CardFront";
import { CardBack } from "./CardBack";
import type { DealCardView, ThingView } from "../types";

export function DealCard({
  data,
  onEdit,
  things = [],
}: {
  data: DealCardView;
  /** open the edit form (3.5b); omitted in read-only contexts (no Edit corner) */
  onEdit?: () => void;
  /** read-only assigned THINGS for the front (D-12); wired from the strip later (S1) */
  things?: ThingView[];
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="relative w-[390px] min-h-[640px]">
      {/* ---- HEADER-CORNER CONTROLS (over the maroon band, above both faces) ---- */}
      {/* flip - top-left corner */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="absolute left-3 top-3 z-20 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition hover:bg-white/30"
        title={flipped ? "Flip to deal" : "Flip to signals & logs"}
        aria-label={flipped ? "Flip to deal" : "Flip to signals and logs"}
      >
        <FlipHorizontal2 className="h-[15px] w-[15px]" />
      </button>

      {/* edit - top-right corner; pencil-lock: only when an edit handler is given */}
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute right-3 top-3 z-20 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition hover:bg-white/30"
          title="Edit deal"
          aria-label="Edit deal"
        >
          <Pencil className="h-[15px] w-[15px]" />
        </button>
      )}

      {/* ---- FRONT FACE - shown by default, cross-fades out when flipped ---- */}
      <div
        className="absolute inset-0 transition-[opacity,visibility] duration-300 ease-in-out"
        style={{
          opacity: flipped ? 0 : 1,
          visibility: flipped ? "hidden" : "visible",
        }}
      >
        <CardFront data={data} things={things} />
      </div>

      {/* ---- BACK FACE - hidden by default, cross-fades in when flipped ---- */}
      <div
        className="absolute inset-0 transition-[opacity,visibility] duration-300 ease-in-out"
        style={{
          opacity: flipped ? 1 : 0,
          visibility: flipped ? "visible" : "hidden",
        }}
      >
        <CardBack data={data} />
      </div>
    </div>
  );
}
