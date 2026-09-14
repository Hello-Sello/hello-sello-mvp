"use client";

/**
 * A panel placed against a trigger but rendered at document.body.
 *
 * The app chrome (IconRail, TopBar) is `.glass`. Wherever the browser applies its
 * backdrop-filter (Safari/iPad), each glass element is its own stacking context
 * AND the containing block for `position: fixed` descendants. A popover rendered
 * inside one cannot rise above page content whatever its z-index, and a
 * `fixed inset-0` click-catcher shrinks to the bar. At body level neither applies.
 *
 * Placement names the side of the anchor, then the shared edge: `right-start`
 * (beside, tops aligned), `right-end` (beside, bottoms aligned), `bottom-end`
 * (below, right edges aligned). `offset` is the gap in px. The position is
 * re-measured on resize and scroll.
 *
 * Pass `onClose` for a full-screen click-catcher plus Escape; leave it out when
 * the caller dismisses the panel itself (the hover flyout).
 */
import { useEffect, useLayoutEffect, useState, type HTMLAttributes, type RefObject } from "react";
import { createPortal } from "react-dom";

export type PopoverPlacement = "right-start" | "right-end" | "bottom-end";

type Position = { top?: number; bottom?: number; left?: number; right?: number };

function positionFor(anchor: DOMRect, placement: PopoverPlacement, offset: number): Position {
  switch (placement) {
    case "right-start":
      return { left: anchor.right + offset, top: anchor.top };
    case "right-end":
      return { left: anchor.right + offset, bottom: window.innerHeight - anchor.bottom };
    case "bottom-end":
      return { top: anchor.bottom + offset, right: window.innerWidth - anchor.right };
  }
}

export function AnchoredPopover({
  anchorRef,
  placement,
  offset = 8,
  onClose,
  className = "",
  children,
  ...panelProps
}: Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
  anchorRef: RefObject<HTMLElement | null>;
  placement: PopoverPlacement;
  offset?: number;
  onClose?: () => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const anchor = anchorRef.current;
      if (anchor) setPosition(positionFor(anchor.getBoundingClientRect(), placement, offset));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef, placement, offset]);

  useEffect(() => {
    if (!onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Nothing renders until the anchor is measured, so the panel never flashes at 0,0.
  if (!position) return null;

  return createPortal(
    <>
      {onClose && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div {...panelProps} style={{ position: "fixed", ...position }} className={`z-50 ${className}`}>
        {children}
      </div>
    </>,
    document.body,
  );
}
