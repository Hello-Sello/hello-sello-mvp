"use client";

/**
 * Hover-zoom preview — a small panel that pops up BESIDE the card you are
 * hovering, not a viewer that covers the page.
 *
 * Anchoring it to the card is not cosmetic. A centred panel sits far from the
 * card that opened it, so reaching its arrows means crossing empty space, and
 * the preview closes on the way — the arrows are visible but unreachable.
 * Sitting flush against the card makes that trip a few pixels.
 *
 * Hover is the trigger, never the only one: focus and click open it too,
 * because hover does not exist on a tablet and a hover-only control would lock
 * out anyone on a keyboard.
 *
 * WCAG 1.4.13 governs content shown on hover and asks for three things:
 *   • dismissible — Escape closes it without moving the mouse
 *   • hoverable   — the pointer can move onto the panel without it vanishing
 *   • persistent  — it never closes on a timer of its own
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/** Panel edge length. Square so the position maths is the same whatever shape
 *  the photo is — a portrait bottle and a landscape box get the same box. */
const PANEL = 340;
const GAP = 10;

export function ImageHoverPreview({
  src,
  alt,
  count,
  position,
  anchor,
  onPrev,
  onNext,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: {
  src: string;
  alt: string;
  /** How many photos this product has — arrows and counter appear only >1. */
  count: number;
  /** 1-based index of the photo on screen. */
  position: number;
  /** The hovered photo's on-screen box; the panel sits against it. */
  anchor: DOMRect | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (count > 1 && e.key === "ArrowLeft") onPrev();
      if (count > 1 && e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    // The panel is pinned to where the card WAS, so a scroll would leave it
    // floating somewhere meaningless. Close instead of trying to track.
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, onPrev, onNext, count]);

  if (typeof document === "undefined" || !anchor) return null;

  // Prefer the right of the card; flip left when there is no room, and keep the
  // whole panel on screen vertically for cards near the top or bottom.
  const roomRight = anchor.right + GAP + PANEL <= window.innerWidth;
  const left = roomRight
    ? anchor.right + GAP
    : Math.max(GAP, anchor.left - GAP - PANEL);
  const top = Math.min(
    Math.max(GAP, anchor.top + anchor.height / 2 - PANEL / 2),
    Math.max(GAP, window.innerHeight - PANEL - GAP),
  );

  return createPortal(
    <div
      data-testid="image-preview"
      role="dialog"
      aria-label={`${alt} — larger view`}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      style={{ top, left, width: PANEL, height: PANEL }}
      className="fixed z-[100] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-ink/10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        data-testid="preview-image"
        className="h-full w-full object-contain"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        data-testid="preview-close"
        className="absolute right-1.5 top-1.5 rounded-full bg-white/85 p-1 text-ink shadow ring-1 ring-ink/10 hover:bg-white"
      >
        <X size={14} />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            data-testid="preview-prev"
            onClick={onPrev}
            className="absolute left-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            data-testid="preview-next"
            onClick={onNext}
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
          >
            <ChevronRight size={16} />
          </button>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink/55 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            {position} / {count}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
