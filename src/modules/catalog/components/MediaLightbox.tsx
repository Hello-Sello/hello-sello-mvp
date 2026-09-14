"use client";

/**
 * Full-screen viewer for a product's photos and documents: the item opens in the
 * middle of the screen over a blurred page, arrows step through the set, and the
 * X, Escape, or a click on the blur closes it.
 *
 * Opens on CLICK, never hover. Closing on a backdrop click means the backdrop
 * takes the pointer, so a hover-opened overlay would register "mouse left the
 * card" and shut the instant it appeared.
 *
 * A PDF shows in the browser's own viewer instead of downloading; the Download
 * button is the explicit way to keep a copy.
 *
 * Portaled to document.body: ProductCard's flip puts a `transform` on an
 * ancestor, and a transformed ancestor traps a `position: fixed` overlay inside
 * the card.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { triggerDownload } from "./download";

export type LightboxItem =
  | { kind: "image"; src: string; alt: string }
  | { kind: "pdf"; src: string; title: string };

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function MediaLightbox({
  items,
  startIndex = 0,
  onClose,
}: {
  /** The set the arrows step through, in display order. Must not be empty. */
  items: LightboxItem[];
  startIndex?: number;
  onClose: () => void;
}) {
  const count = items.length;
  const [index, setIndex] = useState(startIndex);
  const step = (delta: number) => setIndex((i) => (i + delta + count) % count);
  const item = items[index] ?? items[0];
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Modal behaviour: focus moves in, the page behind stops scrolling, and focus
  // returns to whatever opened the viewer when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    // Window CAPTURE phase, and the keys handled here stop there: the page has
    // its own document-level Escape (present mode exits on it), which must not
    // also fire when Escape only meant "close this photo".
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (count > 1 && e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
      else if (count > 1 && e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      else if (e.key === "Tab") {
        // Keep Tab inside the dialog (aria-modal promises the page is inert).
        const buttons = [...(dialogRef.current?.querySelectorAll("button") ?? [])];
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, count]);

  if (typeof document === "undefined") return null;

  const label = item.kind === "image" ? item.alt : item.title;

  return createPortal(
    <div
      ref={dialogRef}
      data-testid="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={count > 1 ? `${label} — ${index + 1} of ${count}` : label}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-md"
    >
      {/* The item plus its controls. Controls sit AROUND the item, not at the
          screen edges: the photo stays well short of full screen, so edge-pinned
          arrows would float far from the thing they act on. Clicks anywhere in
          here stop, so only the blur outside closes. */}
      <div className="relative" onClick={stop}>
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.src}
            src={item.src}
            alt={item.alt}
            data-testid="lightbox-image"
            className="h-[min(65vh,720px)] w-auto max-w-[calc(100vw_-_10rem)] rounded-2xl bg-white object-contain shadow-2xl"
          />
        ) : (
          // A document stays taller than a photo — it has to be readable.
          <iframe
            key={item.src}
            src={item.src}
            title={item.title}
            data-testid="lightbox-pdf"
            className="h-[80vh] w-[min(calc(100vw_-_10rem),860px)] rounded-2xl bg-white shadow-2xl"
          />
        )}

        <div className="absolute bottom-full right-0 mb-3 flex items-center gap-2">
          {item.kind === "pdf" && (
            <button
              type="button"
              data-testid="lightbox-download"
              onClick={() =>
                void triggerDownload(
                  item.src,
                  item.title.toLowerCase().endsWith(".pdf") ? item.title : `${item.title}.pdf`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-deep shadow-lg hover:bg-brand-soft"
            >
              <Download size={16} /> Download
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            data-testid="lightbox-close"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-lg hover:bg-brand-soft"
          >
            <X size={18} />
          </button>
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              data-testid="lightbox-prev"
              onClick={() => step(-1)}
              className="absolute right-full top-1/2 mr-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg hover:bg-white"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="Next"
              data-testid="lightbox-next"
              onClick={() => step(1)}
              className="absolute left-full top-1/2 ml-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-lg hover:bg-white"
            >
              <ChevronRight size={20} />
            </button>
            <span
              data-testid="lightbox-counter"
              className="absolute left-1/2 top-full mt-3 -translate-x-1/2 rounded-full bg-ink/60 px-3 py-1 text-xs font-semibold text-white"
            >
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
