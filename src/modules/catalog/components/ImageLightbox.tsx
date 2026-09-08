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
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        data-testid="lightbox-close"
        className="pointer-events-auto absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
      >
        <X size={20} />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            data-testid="lightbox-prev"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="pointer-events-auto absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            data-testid="lightbox-next"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="pointer-events-auto absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"
          >
            <ChevronRight size={22} />
          </button>
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            {position} / {count}
          </span>
        </>
      )}

      {/* Clicking the photo itself must not close — only the backdrop does. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onPointerEnterImage}
        onMouseLeave={onPointerLeaveImage}
        data-testid="lightbox-image"
        className="pointer-events-auto max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
