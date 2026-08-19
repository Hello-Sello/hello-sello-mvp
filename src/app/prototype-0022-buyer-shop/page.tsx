"use client";

/* ============================================================================
 * ⚠️ THROWAWAY PROTOTYPE — slug 0022-buyer-shop-view, gate G2.
 *
 * DELETE THIS ROUTE AT /build. It is not a feature, has no tests, no data
 * access, and must never be linked to from the app.
 *
 * WHY it is React in `src/app/` instead of a standalone HTML mock (which is the
 * normal prototype shape here): the chosen variant's whole claim is "the buyer
 * view REUSES the seller's shop unchanged." A hand-drawn mock cannot prove that
 * claim — and worse, it would become the G4 visual contract and could teach the
 * builder to reproduce a *new* card instead of reusing ProductCard. So this
 * prototype renders the REAL components inside the REAL app shell:
 *   AppShell (IconRail + TopBar + the basket popover) → ShopView → ProductCard.
 * Muskan's call, 2026-08-19.
 *
 * Precedent for a static design-preview route: `/sella` (see proxy.ts). Unlike
 * /sella this route is NOT allowlisted in the auth guard — be logged in.
 *
 * Data is hardcoded. Nothing is read from or written to Supabase here. The one
 * live wire is add-to-basket, which ShopView hands to the real server action —
 * it will fail on these fake product ids. That failure is EXPECTED.
 * ==========================================================================*/

import { useState } from "react";
import { ShopView } from "@/app/present/ShopView";
import type { Shop, ShopProduct } from "@/modules/catalog/shop";

type Level = "L0" | "MIX" | "L2";

/** A product carrying only what the card actually reads. */
function product(
  over: Partial<ShopProduct> & { id: string; name: string },
): ShopProduct {
  return {
    cultivar: null, thc_percent: null, cbd_percent: null,
    cbg_percent: null, cbn_percent: null,
    cultivator: "Canadian Craft",
    lineage_parent_a: null, lineage_parent_b: null,
    irradiation_code: "Non-irradiated", supplier_product_code: null,
    packaging_material: "Glass jar", resealable: true,
    location: "Vancouver",
    pack_size_grams: 10, unit_code: "g", local_code_pzn: null,
    dominance_code: null, country_of_origin: "CA", region: "British Columbia",
    images: [], media: [], batches: [],
    terpPercent: 2.4,
    profile_visible: true, price_public: true,
    price_per_gram: 8.7,
    bundle_threshold_grams: null, bundle_price_per_gram: null,
    tiers: [], packSizes: [5, 10, 25],
    ...over,
  };
}

/* Six products spanning the states the PRD's acceptance criteria walk:
 * visible/hidden × priced/price-hidden. */
const ALL: ShopProduct[] = [
  product({ id: "p1", name: "Pink Kush", cultivar: "Indica dominant",
    thc_percent: 24.1, cbd_percent: 0.8, cbg_percent: 0.9, cbn_percent: 0.2,
    lineage_parent_a: "OG Kush", lineage_parent_b: "Hindu Kush",
    price_per_gram: 8.7, location: "Vancouver",
    tiers: [{ minGrams: 500, pricePerGram: 7.9 },
            { minGrams: 1000, pricePerGram: 7.2 },
            { minGrams: 2000, pricePerGram: 6.4 }] }),
  product({ id: "p2", name: "Blue Dream", cultivar: "Sativa dominant",
    thc_percent: 19.4, cbd_percent: 1.2, price_per_gram: 9.2, location: "Vancouver",
    tiers: [{ minGrams: 500, pricePerGram: 8.4 }, { minGrams: 1500, pricePerGram: 7.6 }] }),
  // L1 — visible, price hidden. The Request-pricing case (AC 3).
  product({ id: "p3", name: "OG Kush", cultivar: "Hybrid", thc_percent: 22.0,
    cbd_percent: 0.5, price_public: false, price_per_gram: null, location: "Toronto" }),
  // Hidden entirely — only a CONNECTED buyer may see these (AC 5).
  product({ id: "p4", name: "White Widow", cultivar: "Hybrid", thc_percent: 20.8,
    cbd_percent: 0.9, profile_visible: false, price_public: false,
    price_per_gram: null, location: "Toronto" }),
  product({ id: "p5", name: "Amnesia Haze", cultivar: "Sativa", thc_percent: 21.5,
    cbd_percent: 0.4, profile_visible: false, price_per_gram: 7.95, location: "Frankfurt",
    tiers: [{ minGrams: 750, pricePerGram: 7.1 }] }),
  product({ id: "p6", name: "Northern Lights", cultivar: "Indica", thc_percent: 18.2,
    cbd_percent: 1.6, price_per_gram: 8.1, location: "Frankfurt" }),
];

const COMPANY: Shop["company"] = {
  id: "prototype-canadian-craft",
  name: "Canadian Craft",
  tagline: "Licensed producer · Vancouver, BC",
  description:
    "Craft indoor cultivation in British Columbia since 2019. EU-GMP certified, " +
    "GACP compliant. Small-batch, hang-dried, hand-trimmed.",
  cover_path: null, logo_path: null, updated_at: null,
  warehouse_location: "Vancouver", country: "CA", address: "Vancouver, BC",
  website: "https://example.com",
  links: [{ platform: "linkedin", value: "https://linkedin.com/company/example" }],
  locations: [
    { label: "Vancouver HQ", value: "Vancouver, BC" },
    { label: "Toronto warehouse", value: "Toronto, ON" },
    { label: "Frankfurt (EU bond)", value: "Frankfurt, DE" },
  ],
  tags: ["Cultivator", "Wholesale"],
};

export default function Prototype0022() {
  const [connected, setConnected] = useState(false);
  const [level, setLevel] = useState<Level>("MIX");

  /* PRD §4(2): a buyer may see a product if connected OR profile_visible.
     PRD §4(3): connection NEVER reveals a price. */
  const visible = ALL.filter((p) => connected || p.profile_visible);
  const products = visible.map((p) => ({
    ...p,
    price_public:
      level === "L2" ? p.price_per_gram != null
      : level === "L0" ? false
      : p.price_public,
  }));
  const locked = level === "L0" && !connected;

  const shop: Shop = { company: COMPANY, products: locked ? [] : products };

  return (
    <div className="relative">
      {/* ---- prototype control bar (NOT part of the design) ---- */}
      <div className="sticky top-0 z-50 mb-2 flex flex-wrap items-center gap-3 rounded-xl bg-ink px-3 py-2 text-white">
        <span className="text-[10px] font-extrabold tracking-widest text-brand-soft">
          PROTOTYPE 0022 · VARIANT A
        </span>
        <Group label="Buyer">
          <Pill on={!connected} onClick={() => setConnected(false)}>Not connected</Pill>
          <Pill on={connected} onClick={() => setConnected(true)}>Connected</Pill>
        </Group>
        <Group label="Catalogue">
          {(["L0", "MIX", "L2"] as Level[]).map((l) => (
            <Pill key={l} on={level === l} onClick={() => setLevel(l)}>
              {l === "L0" ? "L0 all hidden" : l === "MIX" ? "Mixed L1+L2" : "L2 all priced"}
            </Pill>
          ))}
        </Group>
        <span className="ml-auto max-w-md text-[11px] leading-snug text-white/60">
          Real AppShell · real TopBar basket · real ShopView · real ProductCard.
          Add-to-basket hits the real server action and will fail on these fake ids.
        </span>
      </div>

      {locked ? <LockedCatalogue /> : null}

      {/* viewerCanManage={false} is the buyer mode. It has NO caller in the app
          today — this prototype is its first real exercise. */}
      <ShopView shop={shop} viewerCanManage={false} canEditBranding={false} />
    </div>
  );
}

/** AC 4 — the L0 state. This is the one genuinely NEW piece of UI on the page. */
function LockedCatalogue() {
  return (
    <div className="mx-auto my-4 max-w-[1400px] px-6 sm:px-8">
      <div className="rounded-3xl border border-dashed border-brand-deep/25 bg-white/70 p-8 text-center backdrop-blur">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-xl">🔒</div>
        <h3 className="text-base font-extrabold">This catalogue is private</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-muted">
          Canadian Craft has not published any products publicly. Connect with them to
          see their full shop — connected companies always see the whole catalogue.
        </p>
        <button className="mt-4 rounded-full bg-brand px-6 py-2.5 text-[13px] font-extrabold text-white">
          Connect with Canadian Craft
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/45">{label}</span>
      {children}
    </div>
  );
}

function Pill({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${
        on ? "bg-brand text-white" : "bg-white/15 text-white"
      }`}
    >
      {children}
    </button>
  );
}
