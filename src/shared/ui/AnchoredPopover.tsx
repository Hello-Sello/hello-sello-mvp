"use client";

/**
 * A panel placed against a trigger but rendered at document.body — see BodyPortal
 * for why floating panels must live there.
 *
 * Placement names the side of the anchor, then the shared edge: `bottom-start`
 * (below, left edges aligned), `bottom-end`, `bottom-stretch` (below, as wide as
 * the anchor), `top-start`, `top-end`, `right-start` (beside, tops aligned) and
 * `right-end` (beside, bottoms aligned). `offset` is the gap in px. A top/bottom
 * panel opens on the other side when its own side has no room, and every panel is
 * kept inside the viewport. The position follows resize, scroll and the panel's
 * own size changes.
 *
 * Pass `onClose` for a full-screen click-catcher plus Escape; leave it out when
 * the caller dismisses the panel itself (the hover flyout).
 */
import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import { BodyPortal } from "./BodyPortal";

export type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "bottom-stretch"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end";

type Position = { top?: number; bottom?: number; left?: number; right?: number };

/** The smallest gap kept between a panel and the viewport edge. */
const EDGE = 8;

const clamp = (value: number, max: number) => Math.max(EDGE, Math.min(value, max));

function positionFor(anchor: DOMRect, panel: DOMRect, placement: PopoverPlacement, offset: number): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const [side, align] = placement.split("-");

  if (side === "right") {
    const left = anchor.right + offset;
    return align === "start"
      ? { left, top: clamp(anchor.top, vh - panel.height - EDGE) }
      : { left, bottom: clamp(vh - anchor.bottom, vh - panel.height - EDGE) };
  }

  const fitsBelow = anchor.bottom + offset + panel.height <= vh;
  const fitsAbove = anchor.top - offset - panel.height >= 0;
  const below = side === "bottom" ? fitsBelow || !fitsAbove : fitsBelow && !fitsAbove;
  const vertical = below ? { top: anchor.bottom + offset } : { bottom: vh - anchor.top + offset };

  if (align === "stretch") return { ...vertical, left: anchor.left, right: vw - anchor.right };
  if (align === "start") return { ...vertical, left: clamp(anchor.left, vw - panel.width - EDGE) };
  return { ...vertical, right: clamp(vw - anchor.right, vw - panel.width - EDGE) };
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
  const panelRef = useRef<HTMLDivElement>(null);
  // null until measured: the panel first renders invisibly so its size is known
  // before it is placed, then appears in place without a jump.
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    function measure() {
      const anchor = anchorRef.current;
      if (anchor && panel) {
        setPosition(positionFor(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), placement, offset));
      }
    }
    measure();
    const resize = new ResizeObserver(measure);
    if (panel) resize.observe(panel);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      resize.disconnect();
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

  return (
    <BodyPortal>
      {onClose && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div
        {...panelProps}
        ref={panelRef}
        style={
          position
            ? { position: "fixed", ...position }
            : { position: "fixed", top: 0, left: 0, visibility: "hidden" }
        }
        className={`z-50 ${className}`}
      >
        {children}
      </div>
    </BodyPortal>
  );
}
