"use client";

/**
 * Full-size product photo viewer.
 *
 * Opens on CLICK, never on hover. Hover has no equivalent on a tablet, and a
 * hover-only control fails WCAG 2.1.1 (keyboard) — a seller's device is as
 * likely to be an iPad as a laptop. The card shows a zoom cursor so the photo
 * still reads as clickable.
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        data-testid="lightbox-close"
        className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
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
            className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            data-testid="lightbox-next"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"
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
        data-testid="lightbox-image"
        className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
