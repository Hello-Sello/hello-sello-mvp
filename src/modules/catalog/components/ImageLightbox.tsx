"use client";

/**
 * Full-size product photo viewer.
 *
 * The "hover-zoom" pattern: the card opens this on hover. Hover is the trigger
 * Marcel asked for, but it is never the ONLY trigger — focus and click open it
 * too, because hover does not exist on a tablet and a hover-only control would
 * lock out anyone on a keyboard.
 *
 * WCAG 1.4.13 governs content shown on hover, and asks for three things:
 *   • dismissible — Escape closes it without moving the mouse
 *   • hoverable   — the pointer can move ONTO the photo without it vanishing,
 *                   which is why the image reports enter/leave to the card
 *   • persistent  — it never closes on a timer of its own
 *
 * Rendered through a portal to document.body deliberately: ProductCard's flip
 * animation puts a `transform` on an ancestor, and a transformed ancestor
 * becomes the containing block for `position: fixed` descendants. An overlay
 * rendered in place would be trapped inside the 294px card instead of covering
 * the screen.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export function ImageLightbox({
  src,
  alt,
  count,
  position,
  onPrev,
  onNext,
  onClose,
  onPointerEnterImage,
  onPointerLeaveImage,
}: {
  src: string;
  alt: string;
  /** How many photos this product has — arrows and the counter appear only >1. */
  count: number;
  /** 1-based index of the photo on screen, for the counter. */
  position: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** The enlarged photo tells the card when the pointer is over it, so moving
   *  the mouse from the card onto the photo does not count as "left the card".
   *  This is the "hoverable" half of WCAG 1.4.13. */
  onPointerEnterImage?: () => void;
  onPointerLeaveImage?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (count > 1 && e.key === "ArrowLeft") onPrev();
      if (count > 1 && e.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, count]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — full size`}
      onClick={onClose}
      // The backdrop must NOT take the pointer. It covers the card that opened
      // this, so if it were interactive the card would immediately register
      // "mouse left" and the preview would flicker shut the instant it appeared.
      // Everything the user actually needs to touch re-enables pointer events.
      // Kept light: this is a preview glanced at on hover, not a screen opened.
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-[2px]"
    >
      {/* Controls live ON the photo, not at the screen edges — the photo is
          capped well short of the viewport, so edge-anchored arrows would float
          in empty space far away from the thing they act on. */}
      <div
        className="pointer-events-auto relative"
        onMouseEnter={onPointerEnterImage}
        onMouseLeave={onPointerLeaveImage}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          data-testid="lightbox-image"
          className="max-h-[60vh] max-w-[60vw] rounded-2xl object-contain shadow-2xl"
        />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          data-testid="lightbox-close"
          className="absolute -right-3 -top-3 rounded-full bg-white p-1.5 text-ink shadow-lg ring-1 ring-ink/10 hover:bg-ink/5"
        >
          <X size={16} />
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              data-testid="lightbox-prev"
              onClick={onPrev}
              className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              data-testid="lightbox-next"
              onClick={onNext}
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
            >
              <ChevronRight size={20} />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {position} / {count}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
