"use client";

/**
 * The buyer's view of a seller's shop, at /discover/[companyId].
 *
 * It is a WRAPPER, not a mode: `ShopView` is the seller's shipped storefront and
 * gains no behaviour prop for the buyer (ADR-0005 §1). Everything buyer-specific
 * lives here and reaches `ShopView` through the three slots it already exposes —
 * `viewerCanManage={false}` (owner chrome off), `buyerContext` (the relationship
 * strip), `emptyState` (the locked catalogue). The card is the SAME
 * `catalog/components/ProductCard` /present renders; a buyer-only card would be
 * a build failure, not a style choice (G2 variant A).
 *
 * The shape is the one the G2 prototype proved: no width container and no extra
 * scroll parent. `ShopView`'s root is `flex h-full flex-col … overflow-auto` — it
 * is designed as a near-direct child of AppShell's `<main>`, and wrapping it in
 * an auto-height flex column nests a second scroll container.
 */
import { ShopView } from "@/app/present/ShopView";
import type { Shop } from "@/modules/catalog/shop";
import { VerifiedBadge } from "@/shared/ui/VerifiedBadge";
import { ConnectActions } from "./ConnectActions";
import type { ConnectionState } from "../companies";

export function BuyerShopView({
  shop,
  companyId,
  companyName,
  connectionState,
}: {
  shop: Shop;
  companyId: string;
  companyName: string;
  connectionState: ConnectionState;
}) {
  // The ONE place this component tests emptiness. `ShopView` owns which slot
  // renders; this owns which slot the single Connect action lives in, and the
  // two must agree — hence the same `products.length === 0` rule, stated once.
  const catalogueLocked = shop.products.length === 0;

  return (
    <ShopView
      shop={shop}
      viewerCanManage={false}
      canEditBranding={false}
      buyerContext={
        <div className="flex flex-col gap-2.5">
          {/* Verification is UNCONDITIONAL here: get_discoverable_company only
              returns verified companies, so reaching this page proves it. */}
          <div>
            <VerifiedBadge status="verified" variant="pill" />
          </div>
          {/* The connect affordance itself is ConnectActions — the component
              that already owns every connection state — never a hand-built
              button on this page. Width-capped because ConnectActions is
              `w-full` by design and this slot is the full 4-up grid wide. */}
          {/* AC 4: when the catalogue is LOCKED the Connect action moves INTO
              the locked panel — it is the panel's own call to action, and
              `ShopView` renders the whole three-column ShopInfoRow between this
              slot and the empty state, so from here it is scrolled away from the
              sentence that asks for it. Exactly ONE ConnectActions is mounted
              either way: two would be two copies of connection state on one
              screen (the thing this file rejects the prototype's pill for). */}
          {!catalogueLocked && (
            <div className="max-w-md">
              <ConnectActions
                companyId={companyId}
                companyName={companyName}
                state={connectionState}
              />
            </div>
          )}
        </div>
      }
      emptyState={
        <LockedCatalogue
          companyName={companyName}
          connectAction={
            <ConnectActions
              companyId={companyId}
              companyName={companyName}
              state={connectionState}
            />
          }
        />
      }
    />
  );
}

/**
 * AC 4 — the L0 state: the seller shares nothing publicly. The one genuinely new
 * piece of UI on this page, and the reason `emptyState` exists at all: an empty
 * buyer shop is not an empty owner shop ("add your first product"), it is a
 * catalogue that is private TO THIS VIEWER, and it carries **its own** Connect
 * action — AC 4 requires the action beside the sentence that asks for it.
 *
 * "Beside" has now been got wrong TWICE, in two different ways, so it is worth
 * stating what the criterion actually demands: the action must be BOTH owned by
 * this panel AND on screen with the sentence.
 *   1. The first revision leaned on the `buyerContext` strip and called it
 *      "directly above". It was not — `ShopView` renders the whole three-column
 *      `ShopInfoRow` in between. Fixed by injecting the action here.
 *   2. That fix moved the action into the panel but stacked it UNDER a centred
 *      `p-12` column, so it sat below the fold on a 1080px screen and the buyer
 *      still read the sentence with no control in view (G5 F-01). Fixed by
 *      putting the ask beside the explanation.
 * Ownership was never the failing half. Anything that grows this panel — a
 * longer sentence, a second line, more padding — can reintroduce (2) without
 * touching (1), so check the rendered height, not the component tree.
 */
function LockedCatalogue({
  companyName,
  connectAction,
}: {
  companyName: string;
  connectAction: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <div className="rounded-3xl border border-dashed border-brand-deep/25 bg-white/70 p-6 backdrop-blur sm:p-8">
        {/* SIDE BY SIDE, not stacked — this is the whole of the G5 F-01 fix.
            The old layout was a centred column (🔒 → heading → three lines of
            copy → action) inside `p-12`, which ran ~450px tall and pushed
            Connect off the bottom of a 1080px screen. The buyer read "Connect
            with them" with no control in view. Laying the ask beside the
            explanation instead of under it costs nothing and roughly halves the
            height. It stacks below `sm`, where a scroll is expected anyway. */}
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <div
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-xl"
            >
              🔒
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold">This catalogue is private</h3>
              {/* G5 F-02. The previous sentence ended "connected companies
                  always see the whole catalogue", which is false twice over and
                  was falsified live on 2026-08-24: a CONNECTED buyer hit this
                  same panel (every product was unfiled), and connection does not
                  reveal an unfiled product to anyone. What connection actually
                  does is narrower — it reveals products the seller keeps off
                  their public shop, and never a price. Say only that. */}
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {companyName} hasn&apos;t published any products publicly. Connect with
                them to see the products they keep off their public shop.
              </p>
            </div>
          </div>
          <div className="w-full sm:max-w-xs">{connectAction}</div>
        </div>
      </div>
    </div>
  );
}
