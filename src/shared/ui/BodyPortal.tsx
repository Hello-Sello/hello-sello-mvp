"use client";

/**
 * Renders its children at document.body.
 *
 * Every full-screen overlay (modal, dialog, click-catcher) and every floating panel
 * belongs here. An ancestor with backdrop-filter (our `.glass`, which Safari
 * applies), transform, perspective or filter becomes both the containing block for
 * `position: fixed` and its own stacking context, so an overlay rendered inside it
 * covers only that ancestor and cannot rise above the rest of the page. React
 * events still bubble through the component tree as before; only the DOM position
 * changes. For a panel placed against a trigger, use AnchoredPopover.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
