"use client";

/**
 * Deal card (3a) - the card object with its FRONT and BACK.
 *
 * Phase 3 built the front; Phase 4 adds the flip + the back (Signals + Logs).
 * The flip is a CSS 3D rotate (inline styles - no Tailwind 3D plugin needed):
 * the front defines the box; the back fills it (absolute inset-0) rotated 180°,
 * both with backface hidden so only the facing side shows.
 *
 * 4.5.3: the card's two corner controls live HERE (outside the flipping faces so
 * they stay upright): flip top-left, Edit top-right. The Seal gate is no longer
 * on the card - it moved to the Sella strip. So the faces are pure display.
 *
 * Kept as the single card entry point so the chat placement (Phase 5) mounts
 * one component.
 */
import { useState } from "react";
import { FlipHorizontal2, Pencil } from "lucide-react";
import { CardFront } from "./CardFront";
import { CardBack } from "./CardBack";
import type { DealCardView } from "../types";

export function DealCard({
  data,
  onEdit,
}: {
  data: DealCardView;
  /** open the edit form (3.5b); omitted in read-only contexts (no Edit corner) */
  onEdit?: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="relative w-[340px]" style={{ perspective: "1600px" }}>
      {/* flip control - top-left, stays upright above the flipping faces */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-brand shadow-sm transition hover:bg-white"
        title={flipped ? "Flip to facts" : "Flip to signals & logs"}
        aria-label={flipped ? "Flip to facts" : "Flip to signals and logs"}
      >
        <FlipHorizontal2 className="h-3.5 w-3.5" />
      </button>

      {/* edit control - top-right, the matching corner to flip (4.5.3). Opens the
          edit form; only when an edit handler is given (read-only omits it). */}
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-brand shadow-sm transition hover:bg-white"
          title="Edit deal"
          aria-label="Edit deal"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className="relative transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <CardFront data={data} />
        </div>
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
