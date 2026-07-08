"use client";

import { use, useEffect } from "react";

/**
 * Deal deep-link (Phase 7, D-32) - a card opened by URL. The Deal Room page is
 * retired (D-15); per D-32 a deal card ALWAYS opens as a right-side panel,
 * wherever it is opened from. So this route no longer renders a full-page
 * container - it just DISPATCHES `hs:open-deal-card` for the routed id, and the
 * layout-level `DealCardPanelHost` (mounted around every Connect page) fetches
 * the card and mounts it as the right panel. This keeps the modules acyclic (the
 * page never imports deals' or messaging's internals) and makes the deep-link
 * behave identically to opening from a chat or the Relationship page.
 *
 * The dispatch is deferred to the next animation frame so it fires AFTER the host
 * has mounted its window-event listener (child effects run before parent effects,
 * so a synchronous dispatch on mount would race the listener and be missed).
 *
 * Next 16 / React 19: `params` is a promise - `use()` unwraps it in a client
 * component.
 */
export default function ConnectDealDeepLinkPage({
  params,
}: {
  params: Promise<{ dealCardId: string }>;
}) {
  const { dealCardId } = use(params);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("hs:open-deal-card", { detail: { dealCardId } }),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [dealCardId]);

  return null;
}
