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
 * (An earlier revision leaned on the `buyerContext` strip and described it as
 * "directly above". It is not: `ShopView` renders the entire three-column
 * `ShopInfoRow` in between, so the buyer read "Connect with them" with the
 * control scrolled off. The action is injected rather than built here so this
 * panel never hand-rolls a second connect affordance.)
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
      <div className="rounded-3xl border border-dashed border-brand-deep/25 bg-white/70 p-12 text-center backdrop-blur">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-xl">
          🔒
        </div>
        <h3 className="text-base font-extrabold">This catalogue is private</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-muted">
          {companyName} has not published any products publicly. Connect with them to
          see their full shop — connected companies always see the whole catalogue.
        </p>
        <div className="mx-auto mt-4 max-w-md text-left">{connectAction}</div>
      </div>
    </div>
  );
}
