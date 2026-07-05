"use client";

/**
 * The redesigned Present flip card. FRONT (built here): a square cover photo, a
 * 5-value THC/CBD/CBG/CBN/Terp% strip, a scrollable spec-row list, pack-size
 * bubbles beside the price, and a qty stepper + Add-to-basket CONTROL. BACK: a
 * placeholder face so the flip mechanic exists now; its "Documents & Media"
 * content lands in a later plan. The away-facing face is pointer-events:none so it
 * never intercepts clicks on the visible face (the prototype's "back-to-front" bug).
 *
 * Reusable by design: exported through the catalog barrel so the buyer view,
 * present mode, and the deal basket import the same card. This plan ships the Add
 * CONTROL only — there is NO basket store, drawer, or send flow here.
 */
import { useState } from "react";
import { Heart, RotateCw, Minus, Plus, ShoppingCart, EyeOff } from "lucide-react";
import type { ShopProduct } from "../shop";
import { PackSizeSelector } from "./PackSizeSelector";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** Build a public shop-media URL from a stored path (mirrors ShopView's builder). */
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

const DOMINANCE_LABEL: Record<string, string> = {
  indica: "Indica",
  sativa: "Sativa",
  hybrid: "Hybrid",
  indica_dominant: "Indica-Dominant",
  sativa_dominant: "Sativa-Dominant",
};

/** Price as "8,00€" (comma decimal, EU convention) — matches ShopView's `eur`. */
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")}€`;
/** A measured value, or "n.a." when the seller has not supplied it. */
const na = (v: number | null) => (v == null ? "n.a." : String(v).replace(".", ","));

// Country name / ISO-2 code → flag emoji for the header glyph. Best-effort: an
// unknown country renders no flag (the Origin spec row still carries the text).
const COUNTRY_CODE: Record<string, string> = {
  canada: "CA", germany: "DE", netherlands: "NL", portugal: "PT",
  spain: "ES", "united kingdom": "GB", uk: "GB", "united states": "US", usa: "US",
};
function countryFlag(country: string | null): string {
  if (!country) return "";
  const code = (COUNTRY_CODE[country.trim().toLowerCase()] ?? (country.length === 2 ? country : "")).toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The pack sizes offered for a product: its own pack size, plus the bundle tier
 *  when one is priced. v0 has one price/g — the bubbles select intent, not price. */
function packLabels(p: ShopProduct): string[] {
  const labels: string[] = [];
  if (p.pack_size_grams != null) labels.push(`${p.pack_size_grams}g`);
  if (p.bundle_threshold_grams != null) labels.push(`${p.bundle_threshold_grams}g+`);
  return labels;
}

export function ProductCard({
  product: p,
  onAddToBasket,
  editing = false,
}: {
  product: ShopProduct;
  companyId?: string;
  editing?: boolean;
  /** Fires on Add — the store/send flow is a later phase; defaults to a no-op here. */
  onAddToBasket?: (productId: string, qty: number, packIndex: number) => void;
  onChanged?: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [pack, setPack] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);

  const cover = p.images[0] ? mediaUrl(p.images[0].path) : null;
  const packs = packLabels(p);
  const specRows: [string, string][] = [
    ["Dominance", p.dominance_code ? DOMINANCE_LABEL[p.dominance_code] ?? p.dominance_code : "n.a."],
    ["Cultivator", p.cultivator ?? "n.a."],
    ["Origin", p.country_of_origin ?? "n.a."],
    ["Region", p.region ?? "n.a."],
    ["Lineage", p.lineage_parent_a || p.lineage_parent_b ? `${p.lineage_parent_a ?? "?"} × ${p.lineage_parent_b ?? "?"}` : "n.a."],
    ["Irradiation", p.irradiation_code ?? "n.a."],
    ["Packaging", p.packaging_material ?? "n.a."],
    ["Resealable", p.resealable == null ? "n.a." : p.resealable ? "Yes" : "No"],
    ["Supplier code", p.supplier_product_code ?? "n.a."],
  ];
  const priceShown = p.price_public && p.price_per_gram != null;
  const flag = countryFlag(p.country_of_origin);

  return (
    <div
      data-testid="product-card"
      className="relative h-[544px]"
      style={{ perspective: "1900px" }}
    >
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        {/* ---------- FRONT ---------- */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-white/60"
          style={{ backfaceVisibility: "hidden", pointerEvents: flipped ? "none" : undefined }}
        >
          {/* square photo — object-cover keeps it square at any column width */}
          <div
            data-testid="card-photo"
            className="relative aspect-square w-full shrink-0 overflow-hidden bg-brand-soft/40"
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={p.cultivar ?? p.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-brand-deep/70">
                {p.cultivar ?? p.name}
              </div>
            )}
            {/* only status/visibility badges sit on the image */}
            {!p.profile_visible && (
              <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-bold text-white">
                <EyeOff size={11} /> Hidden
              </div>
            )}
            <button
              type="button"
              aria-label={liked ? "Unlike" : "Like"}
              onClick={() => setLiked((v) => !v)}
              className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full ${
                liked ? "bg-brand text-white" : "bg-white/90 text-brand"
              }`}
            >
              <Heart size={15} fill={liked ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur hover:bg-ink/80"
            >
              <RotateCw size={12} /> Docs &amp; media
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-2 px-3.5 pt-2.5">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-extrabold leading-tight text-brand-deep">{p.name}</div>
                {p.cultivar && <div className="mt-0.5 truncate text-xs text-ink-muted">{p.cultivar}</div>}
                {p.local_code_pzn && <div className="mt-0.5 text-[11px] text-ink/45">PZN{p.local_code_pzn}</div>}
              </div>
              {flag && <span className="ml-auto text-lg leading-none">{flag}</span>}
            </div>

            {/* 5-value strip: THC / CBD / CBG / CBN / Terp% */}
            <div className="grid grid-cols-5 gap-1 px-3.5 pt-2">
              {(
                [
                  ["THC%", p.thc_percent],
                  ["CBD%", p.cbd_percent],
                  ["CBG%", p.cbg_percent],
                  ["CBN%", p.cbn_percent],
                  ["Terp%", p.terpPercent],
                ] as [string, number | null][]
              ).map(([label, val]) => (
                <div key={label} className="rounded-md border border-ink/10 bg-brand/[0.025] px-0.5 py-1 text-center">
                  <b className="block text-[12.5px] font-extrabold leading-none text-brand-deep tabular-nums">{na(val)}</b>
                  <small className="text-[7px] font-bold uppercase tracking-wide text-ink/45">{label}</small>
                </div>
              ))}
            </div>

            {/* scrollable full product-info list; lineage clamped to 2 lines */}
            <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5">
              {specRows.map(([k, v]) => (
                <div key={k} className="flex items-start gap-2 border-b border-ink/10 py-1.5 text-xs">
                  <span className="w-[78px] shrink-0 font-medium text-ink-muted">{k}</span>
                  <span className={`font-semibold leading-snug ${k === "Lineage" ? "line-clamp-2" : ""}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* footer: pack bubbles + price, then availability + stepper + Add */}
            <div className="relative z-[5] shrink-0 border-t border-ink/10 bg-white px-3.5 pb-3 pt-2.5">
              <div className="mb-2 flex items-end justify-between gap-2.5">
                <PackSizeSelector sizes={packs} selected={pack} onSelect={setPack} />
                <div className="flex shrink-0 flex-col items-end">
                  {priceShown ? (
                    <span className="text-right text-[17px] font-extrabold text-brand-deep tabular-nums">
                      <small className="-mb-0.5 block text-[10.5px] font-semibold text-ink-muted">Approx.</small>
                      {eur(p.price_per_gram as number)}<span className="text-xs">/g</span>
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand-deep">Price on request</span>
                  )}
                </div>
              </div>
              {/* static availability indicator — a stock/availability field is a later
                  data-model addition; the shop currently has no per-product stock. */}
              <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> Available
              </div>
              <div className="flex gap-2">
                <div className="flex items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)]">
                  <button
                    type="button" aria-label="Decrease quantity"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-brand-deep hover:bg-brand/10"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[30px] text-center text-[13px] font-bold tabular-nums">{qty}</span>
                  <button
                    type="button" aria-label="Increase quantity"
                    onClick={() => setQty((q) => q + 1)}
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-brand-deep hover:bg-brand/10"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => onAddToBasket?.(p.id, qty, pack)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-2 text-[12.5px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
                >
                  <ShoppingCart size={14} /> Add to basket
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- BACK (placeholder — Documents & Media is 07-04) ---------- */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-white/60"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", pointerEvents: flipped ? undefined : "none" }}
        >
          <div className="flex items-center gap-2 bg-gradient-to-br from-brand-deep to-brand px-3.5 py-3 text-white">
            <div className="min-w-0">
              <b className="block text-sm font-bold">Documents &amp; media</b>
              <small className="block truncate text-[11px] opacity-85">{p.name}</small>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-ink-muted">
            Media &amp; COA management arrives with the card back (07-04).
          </div>
          <div className="border-t border-ink/10 p-3">
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/10"
            >
              <RotateCw size={12} className="-scale-x-100" /> Back to front
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
