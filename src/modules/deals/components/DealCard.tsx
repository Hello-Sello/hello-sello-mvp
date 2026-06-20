"use client";

/**
 * Deal card (3a) - the card object with its FRONT and BACK.
 *
 * Flip (Phase 4 S2): a REAL CSS-3D flip. The card physically rotates on the Y
 * axis between the front (deal facts) and the back (Signals + Logs). The 3D is
 * inline-styled - `perspective` on the outer box, `preserve-3d` + `rotateY` on
 * the flipping layer, and `backface-visibility: hidden` on both faces so only
 * the facing side shows. (An earlier V3 pass replaced this with a cross-fade to
 * dodge a rotateY glitch, but the real flip is the intended feel, so it is
 * restored - the perspective + preserve-3d + backface combo renders cleanly.)
 *
 * The FRONT is in normal flow and DEFINES the card box; the BACK fills it
 * (`absolute inset-0`) pre-rotated 180deg so it faces forward once flipped.
 *
 * The two corner controls live in the maroon HEADER corners (V3) and sit
 * OUTSIDE the flipping layer, so they stay upright on both faces: flip top-left,
 * Edit top-right - ~30px round translucent-white buttons over the maroon band.
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
    <div className="relative w-[390px]" style={{ perspective: "1600px" }}>
      {/* ---- HEADER-CORNER CONTROLS (over the maroon band, OUTSIDE the flipping
           layer so they stay upright on both faces) ---- */}
      {/* flip - top-left corner */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="absolute left-3 top-3 z-30 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition hover:bg-white/30"
        title={flipped ? "Flip to deal" : "Flip to signals & logs"}
        aria-label={flipped ? "Flip to deal" : "Flip to signals and logs"}
      >
        <FlipHorizontal2 className="h-[15px] w-[15px]" />
      </button>

      {/* edit - top-right corner; pencil-lock: only when an edit handler is given */}
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute right-3 top-3 z-30 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition hover:bg-white/30"
          title="Edit deal"
          aria-label="Edit deal"
        >
          <Pencil className="h-[15px] w-[15px]" />
        </button>
      )}

      {/* ---- FLIPPING LAYER: rotates on Y between the two faces ---- */}
      <div
        className="relative transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT - in normal flow, defines the card box; hidden once rotated away */}
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <CardFront data={data} things={things} />
        </div>

        {/* BACK - fills the box, pre-rotated 180deg so it faces forward when flipped */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardBack data={data} />
        </div>
      </div>
    </div>
  );
}
