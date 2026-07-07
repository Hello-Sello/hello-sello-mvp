"use client";

/**
 * The redesigned Present flip card. FRONT (built here): an image CAROUSEL cover, a
 * 5-value THC/CBD/CBG/CBN/Terp% strip, a scrollable spec-row list, pack-size
 * bubbles beside the price, and a qty stepper + Add-to-basket CONTROL. BACK: the
 * reusable MediaManager (F-03 owns its contents).
 *
 * EDIT MODE (F-02): the card's own fields — name, price(/g) + price_public,
 * THC/CBD/CBG/CBN, Terp% — and its lots (add / edit / delete) become inline, but
 * the card WRITES NOTHING itself. Every change is reported UP via onEditField /
 * onBatch* into ShopView's per-product pending-edit tree (marking the shop dirty);
 * the ONE pink Save flushes it, ✕ discard rolls it all back. The card is a
 * CONTROLLED view of its `draft` overlay. Show/hide + soft-delete stay IMMEDIATE
 * (discrete state actions, not text fields) — unchanged from 07-04.
 *
 * The "Select batch (optional) ▾" picker (non-edit, owner) is SELECTION ONLY; the
 * send flow is Phase 17. Reusable by design — exported through the catalog barrel.
 * The away-facing face is pointer-events:none so it never intercepts clicks on the
 * visible face (the prototype's "back-to-front" bug).
 */
import { useState } from "react";
import {
  Heart, RotateCw, Minus, Plus, ShoppingCart, EyeOff, Eye,
  GripVertical, Trash2, ChevronLeft, ChevronRight, ChevronDown, X, Pencil,
} from "lucide-react";
import type { ShopProduct } from "../shop";
import { PackSizeSelector } from "./PackSizeSelector";
import { MediaManager } from "./MediaManager";
import { softDeleteProduct, setProductProfileVisible } from "../manage";
import { DOMINANCE_CODES, IRRADIATION_CODES } from "../template";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** Build a public shop-media URL from a stored path (mirrors ShopView's builder). */
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

// ── Pending-edit draft (the contract ShopView batches under the one Save) ──────
// Field values are held as RAW input strings so decimals type smoothly; ShopView
// parses them to numbers at flush time. Absent keys mean "unchanged"; the card is
// a controlled view of this overlay, so ✕ discard (clearing the tree) reverts it.

/** A client-only pending lot insert (not yet in the DB); tempId keys it. */
export type PendingBatchInsert = {
  tempId: string;
  batch_number: string;
  thc_percent: string;
  cbd_percent: string;
  expiry_date: string;
};
/** A pending patch to a live lot (raw input strings). */
export type PendingBatchEdit = {
  batch_number?: string;
  thc_percent?: string;
  cbd_percent?: string;
  expiry_date?: string;
};
/** Raw-string overlays for the card's inline product fields. F-05 adds the
 *  other spec-row fields (Cluster F) alongside the F-02 numeric strip + name:
 *  free text, enum codes (dominance/irradiation — raw code string, "" = n.a.),
 *  and a boolean (resealable). Same contract — absent means "unchanged". */
export type ProductFieldDraft = {
  name?: string;
  thc_percent?: string;
  cbd_percent?: string;
  cbg_percent?: string;
  cbn_percent?: string;
  terpene_percent?: string;
  price_per_gram?: string;
  price_public?: boolean;
  cultivator?: string;
  country_of_origin?: string;
  region?: string;
  lineage_parent_a?: string;
  lineage_parent_b?: string;
  dominance_code?: string;
  irradiation_code?: string;
  packaging_material?: string;
  resealable?: boolean;
  supplier_product_code?: string;
  /** Raw comma-separated grams (e.g. "10, 20, 50") — parsed to number[] at
   *  flush, same raw-string-until-Save contract as the rest of this draft. */
  pack_sizes?: string;
};
/** The per-product pending overlay ShopView flushes on Save. */
export type ProductDraft = {
  fields: ProductFieldDraft;
  batchInserts: PendingBatchInsert[];
  batchEdits: Record<string, PendingBatchEdit>;
  batchDeletes: string[];
};
/** A pointer to a lot in the draft — a pending insert (tempId) or a live lot. */
export type BatchRef = { kind: "new"; tempId: string } | { kind: "existing"; batchId: string };

/** The numeric field keys the strip + price input edit (all raw-string in draft). */
type NumFieldKey =
  | "thc_percent" | "cbd_percent" | "cbg_percent" | "cbn_percent"
  | "terpene_percent" | "price_per_gram";

// ── Spec-row inline editing (F-05 / Cluster F) ────────────────────────────────
// The scrollable spec-row list below the strip: free text, enum-code selects
// (Dominance/Irradiation — NOT free text, per the locked spec), and one
// boolean (Resealable). Same controlled-by-draft contract as the strip; the
// row descriptor carries its own display string so the read path stays a
// single mapped array (no duplicate "how do I show this" logic).
type TextFieldKey =
  | "cultivator" | "country_of_origin" | "region"
  | "packaging_material" | "supplier_product_code";
type EnumFieldKey = "dominance_code" | "irradiation_code";
type SpecRowDef =
  | { kind: "text"; key: TextFieldKey; label: string; display: string }
  | { kind: "enum"; key: EnumFieldKey; label: string; display: string; codes: readonly string[]; labelMap: Record<string, string> }
  | { kind: "bool"; key: "resealable"; label: string; display: string }
  | { kind: "lineage"; label: "Lineage"; display: string };

const specField =
  "w-full min-w-0 rounded border border-ink/15 bg-white px-1.5 py-0.5 text-xs font-semibold text-brand-deep focus:border-brand focus:outline-none";

const DOMINANCE_LABEL: Record<string, string> = {
  indica: "Indica",
  sativa: "Sativa",
  hybrid: "Hybrid",
  indica_dominant: "Indica-Dominant",
  sativa_dominant: "Sativa-Dominant",
};
const IRRADIATION_LABEL: Record<string, string> = {
  beta: "Beta",
  gamma: "Gamma",
  un_irradiated: "Un-irradiated",
};

/** Price as "8,00€" (comma decimal, EU convention) — matches ShopView's `eur`. */
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")}€`;
/** A measured value, or "n.a." when the seller has not supplied it. */
const na = (v: number | null) => (v == null ? "n.a." : String(v).replace(".", ","));
/** A number as a raw input string ("" when null) for a controlled input. */
const numStr = (v: number | null) => (v == null ? "" : String(v));

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
  // Discrete pack-size options — the product's own size plus any extra sizes
  // the seller added (p.packSizes, v0 metadata list), deduped + sorted so the
  // buyer picks a size like choosing a T-shirt size before adding to basket.
  const sizes = new Set<number>(p.packSizes);
  if (p.pack_size_grams != null) sizes.add(p.pack_size_grams);
  const labels = [...sizes].sort((a, b) => a - b).map((g) => `${g}g`);
  if (p.bundle_threshold_grams != null) labels.push(`${p.bundle_threshold_grams}g+`);
  return labels;
}

export function ProductCard({
  product: p,
  companyId,
  onAddToBasket,
  editing = false,
  onChanged,
  draft,
  onEditField,
  onBatchInsert,
  onBatchChange,
  onBatchRemove,
}: {
  product: ShopProduct;
  companyId?: string;
  editing?: boolean;
  /** Fires on Add — the store/send flow is a later phase; defaults to a no-op here. */
  onAddToBasket?: (productId: string, qty: number, packIndex: number) => void;
  /** Re-pull after an IMMEDIATE action (show/hide, soft-delete). */
  onChanged?: () => void;
  /** The per-product pending overlay (edit mode); the card reads it to render. */
  draft?: ProductDraft;
  /** Report a field change UP (batched; the card never writes it itself). */
  onEditField?: (productId: string, patch: Partial<ProductFieldDraft>) => void;
  /** Append an empty pending lot to the draft. */
  onBatchInsert?: (productId: string) => void;
  /** Report a lot field change (pending insert or live lot). */
  onBatchChange?: (productId: string, ref: BatchRef, patch: PendingBatchEdit) => void;
  /** Drop a pending insert, or mark a live lot for soft-delete. */
  onBatchRemove?: (productId: string, ref: BatchRef) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [pack, setPack] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  // Carousel index over p.images (wraps); busy guards the immediate actions.
  const [imgIdx, setImgIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  // Full-field edit dialog (edit mode): the same spec rows as the inline scroll
  // list, laid out full-size — feedback was that the cramped inline inputs are
  // hard to see/use. Reuses the same onEditField draft, not a second write path.
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function toggleVisible() {
    setBusy(true);
    const res = await setProductProfileVisible(p.id, !p.profile_visible);
    setBusy(false);
    if (!("error" in res)) onChanged?.();
  }

  async function deleteProduct() {
    if (!window.confirm(`Delete "${p.name}"? It is removed from your shop (recoverable).`)) return;
    setBusy(true);
    const res = await softDeleteProduct(p.id);
    setBusy(false);
    if (!("error" in res)) onChanged?.();
  }

  // Field draft accessors (controlled by the overlay, falling back to the product).
  const fields = draft?.fields ?? {};
  const nameVal = fields.name ?? p.name;
  const numVal = (k: NumFieldKey, fallback: number | null) => fields[k] ?? numStr(fallback);
  const pricePublic = fields.price_public ?? p.price_public;

  // Carousel: current cover, wrapping through p.images (placeholder when empty).
  const images = p.images;
  const hasImages = images.length > 0;
  const idx = hasImages ? ((imgIdx % images.length) + images.length) % images.length : 0;
  const cover = hasImages ? mediaUrl(images[idx].path) : null;

  const packs = packLabels(p);
  const specRows: SpecRowDef[] = [
    {
      kind: "enum", key: "dominance_code", label: "Dominance", codes: DOMINANCE_CODES, labelMap: DOMINANCE_LABEL,
      display: p.dominance_code ? DOMINANCE_LABEL[p.dominance_code] ?? p.dominance_code : "n.a.",
    },
    { kind: "text", key: "cultivator", label: "Cultivator", display: p.cultivator ?? "n.a." },
    { kind: "text", key: "country_of_origin", label: "Origin", display: p.country_of_origin ?? "n.a." },
    { kind: "text", key: "region", label: "Region", display: p.region ?? "n.a." },
    {
      kind: "lineage", label: "Lineage",
      display: p.lineage_parent_a || p.lineage_parent_b ? `${p.lineage_parent_a ?? "?"} × ${p.lineage_parent_b ?? "?"}` : "n.a.",
    },
    {
      kind: "enum", key: "irradiation_code", label: "Irradiation", codes: IRRADIATION_CODES, labelMap: IRRADIATION_LABEL,
      display: p.irradiation_code ? IRRADIATION_LABEL[p.irradiation_code] ?? p.irradiation_code : "n.a.",
    },
    { kind: "text", key: "packaging_material", label: "Packaging", display: p.packaging_material ?? "n.a." },
    {
      kind: "bool", key: "resealable", label: "Resealable",
      display: p.resealable == null ? "n.a." : p.resealable ? "Yes" : "No",
    },
    { kind: "text", key: "supplier_product_code", label: "Supplier code", display: p.supplier_product_code ?? "n.a." },
  ];
  // The strip: label · display value · the draft key + fallback its input edits.
  const strip: [string, NumFieldKey, number | null][] = [
    ["THC%", "thc_percent", p.thc_percent],
    ["CBD%", "cbd_percent", p.cbd_percent],
    ["CBG%", "cbg_percent", p.cbg_percent],
    ["CBN%", "cbn_percent", p.cbn_percent],
    ["Terp%", "terpene_percent", p.terpPercent],
  ];
  const priceShown = !editing && pricePublic && p.price_per_gram != null;
  const flag = countryFlag(p.country_of_origin);

  return (
    <>
    <div
      data-testid="product-card"
      className="relative h-[640px]"
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
          {/* Square cover, but capped at 250px tall (matches the prototype's
              .pc-photo max-height) so the fixed-height card keeps ~294px for the
              spec rows below — without the cap the square image swallows the card
              and the spec list collapses to ~0px (object-cover crops the overflow). */}
          <div
            data-testid="card-photo"
            className="relative aspect-square max-h-[250px] w-full shrink-0 overflow-hidden bg-brand-soft/40"
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={p.cultivar ?? p.name} className="h-full w-full object-cover" />
            ) : (
              <div
                data-testid="card-cover-placeholder"
                className="flex h-full w-full items-center justify-center text-sm font-semibold text-brand-deep/70"
              >
                {p.cultivar ?? p.name}
              </div>
            )}

            {/* carousel arrows + dots (only with >1 image) */}
            {hasImages && images.length > 1 && (
              <>
                <button
                  type="button" aria-label="Previous image" data-testid="carousel-prev"
                  onClick={() => setImgIdx((i) => i - 1)}
                  className="absolute left-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button" aria-label="Next image" data-testid="carousel-next"
                  onClick={() => setImgIdx((i) => i + 1)}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/45 text-white backdrop-blur hover:bg-ink/70"
                >
                  <ChevronRight size={16} />
                </button>
                <div data-testid="carousel-dots" className="absolute bottom-9 left-1/2 flex -translate-x-1/2 gap-1">
                  {images.map((im, k) => (
                    <span key={im.id} className={`h-1.5 w-1.5 rounded-full ${k === idx ? "bg-white" : "bg-white/50"}`} />
                  ))}
                </div>
              </>
            )}

            {/* Edit tools (owner, edit mode): drag grip to move location · show/hide ·
                delete. The grip is the only draggable handle — the card→group move
                is handled by LocationGroup's drop target. */}
            {editing ? (
              <div className="absolute inset-x-2 top-2 z-[9] flex items-center gap-1.5">
                <span
                  aria-label="Drag to move to another location"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/product-id", p.id);
                    e.dataTransfer.setData("application/product-loc", p.location ?? "");
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="grid h-7 w-7 shrink-0 cursor-grab place-items-center rounded-lg bg-ink/60 text-white active:cursor-grabbing"
                >
                  <GripVertical size={14} />
                </span>
                <button
                  type="button"
                  aria-label={p.profile_visible ? "Hide product" : "Show product"}
                  disabled={busy}
                  onClick={toggleVisible}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-bold text-ink shadow-sm disabled:opacity-40"
                >
                  {p.profile_visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  {p.profile_visible ? "Visible" : "Hidden"}
                </button>
                {/* Opens the full-field edit dialog — lives here (always visible)
                    rather than above the scrollable spec list, which can be
                    squeezed thin by the card's fixed height. */}
                <button
                  type="button"
                  data-testid="open-details-dialog"
                  aria-label="Edit all product details"
                  onClick={() => setDetailsOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-bold text-ink shadow-sm"
                >
                  <Pencil size={12} /> Edit details
                </button>
                <button
                  type="button"
                  aria-label="Delete product"
                  disabled={busy}
                  onClick={deleteProduct}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-rose-600 shadow-sm disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}
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
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    aria-label="Product name"
                    value={nameVal}
                    onChange={(e) => onEditField?.(p.id, { name: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-ink/20 bg-white px-1.5 py-0.5 text-[15px] font-extrabold leading-tight text-brand-deep focus:border-brand focus:outline-none"
                  />
                ) : (
                  <div className="truncate text-[16px] font-extrabold leading-tight text-brand-deep">{p.name}</div>
                )}
                {p.cultivar && <div className="mt-0.5 truncate text-xs text-ink-muted">{p.cultivar}</div>}
                {p.local_code_pzn && <div className="mt-0.5 text-[11px] text-ink/45">PZN{p.local_code_pzn}</div>}
              </div>
              {flag && <span className="ml-auto text-lg leading-none">{flag}</span>}
            </div>

            {/* 5-value strip: THC / CBD / CBG / CBN / Terp% — inline inputs in edit mode */}
            <div className="grid grid-cols-5 gap-1 px-3.5 pt-2">
              {strip.map(([label, key, val]) => (
                <div key={label} className="rounded-md border border-ink/10 bg-brand/[0.025] px-0.5 py-1 text-center">
                  {editing ? (
                    <input
                      aria-label={`${label.replace("%", " %")}`}
                      inputMode="decimal"
                      value={numVal(key, val)}
                      onChange={(e) => onEditField?.(p.id, { [key]: e.target.value })}
                      className="w-full rounded border border-ink/15 bg-white px-0.5 py-0.5 text-center text-[12px] font-extrabold tabular-nums text-brand-deep focus:border-brand focus:outline-none"
                    />
                  ) : (
                    <b className="block text-[12.5px] font-extrabold leading-none text-brand-deep tabular-nums">{na(val)}</b>
                  )}
                  <small className="text-[7px] font-bold uppercase tracking-wide text-ink/45">{label}</small>
                </div>
              ))}
            </div>

            {/* scrollable full product-info list — a form in edit mode (F-05): every
                row becomes a controlled input/select, batched the same way as the
                strip above; lineage clamped to 2 lines in the read view. The batch
                editor (edit) / picker (view) live here so the card keeps its fixed
                height. min-h-[120px] is a hard floor (not min-h-0) — without it,
                a tall footer (e.g. edit mode's stacked price fields, or the batch
                picker) can flex-shrink this area to a sliver, hiding freshly
                edited/saved fields entirely (reported bug, 2026-07-07). The bottom
                fade + chevron cue that the list still scrolls past that floor. */}
            <div className="relative mt-1.5 flex min-h-[120px] flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5">
                {specRows.map((row) => (
                  <div key={row.label} className="flex items-start gap-2 border-b border-ink/10 py-1.5 text-xs">
                    <span className="w-[78px] shrink-0 font-medium text-ink-muted">{row.label}</span>
                    {editing ? (
                      <SpecFieldEditor
                        row={row}
                        fields={fields}
                        product={p}
                        onChange={(patch) => onEditField?.(p.id, patch)}
                      />
                    ) : (
                      <span className={`font-semibold leading-snug ${row.label === "Lineage" ? "line-clamp-2" : ""}`}>
                        {row.display}
                      </span>
                    )}
                  </div>
                ))}
                {editing && (
                  <BatchEditor
                    product={p}
                    draft={draft}
                    onInsert={onBatchInsert}
                    onChange={onBatchChange}
                    onRemove={onBatchRemove}
                  />
                )}
              </div>
              {/* Soft scroll cue — a bottom fade (no button/chevron) that hints the
                  spec list continues below the fold. Non-interactive; the clamped
                  lineage row is the prototype's other "there's more" signal. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white via-white/70 to-transparent" />
            </div>

            {/* footer: pack bubbles + price, then availability + stepper + Add */}
            <div className="relative z-[5] shrink-0 border-t border-ink/10 bg-white px-3.5 pb-3 pt-2.5">
              <div className="mb-2 flex items-end justify-between gap-2.5">
                <PackSizeSelector sizes={packs} selected={pack} onSelect={setPack} />
                <div className="flex shrink-0 flex-col items-end">
                  {editing ? (
                    <div className="flex flex-col items-end gap-1">
                      <label className="flex items-center gap-1 text-[13px] font-extrabold text-brand-deep">
                        <input
                          aria-label="Price per gram"
                          inputMode="decimal"
                          value={numVal("price_per_gram", p.price_per_gram)}
                          onChange={(e) => onEditField?.(p.id, { price_per_gram: e.target.value })}
                          className="w-16 rounded border border-ink/20 bg-white px-1 py-0.5 text-right tabular-nums focus:border-brand focus:outline-none"
                        />
                        <span className="text-xs">€/g</span>
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-ink-muted">
                        <input
                          type="checkbox"
                          aria-label="Show price to buyers"
                          checked={pricePublic}
                          onChange={(e) => onEditField?.(p.id, { price_public: e.target.checked })}
                        />
                        Show price
                      </label>
                    </div>
                  ) : priceShown ? (
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
              {/* Batch selection lives in the footer, beside Add-to-basket — not
                  inside the scrollable spec list above (feedback: it was easy to
                  miss buried in the scroll). Owner-only, view mode. */}
              {!editing && p.batches.length > 0 && <BatchPicker product={p} />}
            </div>
          </div>
        </div>

        {/* ---------- BACK — Documents & Media (reusable MediaManager) ---------- */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-white/60"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", pointerEvents: flipped ? undefined : "none" }}
        >
          <MediaManager product={p} companyId={companyId} editing={editing} onChanged={onChanged} />
          <div className="shrink-0 border-t border-ink/10 p-3">
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
    {editing && detailsOpen && (
      <ProductDetailsDialog
        product={p}
        nameVal={nameVal}
        strip={strip}
        numVal={numVal}
        specRows={specRows}
        fields={fields}
        onEditField={(patch) => onEditField?.(p.id, patch)}
        onClose={() => setDetailsOpen(false)}
      />
    )}
    </>
  );
}

// ── Full-field edit dialog (edit mode) ────────────────────────────────────────
// The same fields as the inline strip + scrollable spec list, laid out full-size
// in a modal instead of cramped inline inputs (feedback: hard to see/use while
// editing). Reuses the SAME onEditField draft callback as the inline editors —
// this is an alternate presentation over the existing pending-edit contract, not
// a second write path.
function ProductDetailsDialog({
  product: p, nameVal, strip, numVal, specRows, fields, onEditField, onClose,
}: {
  product: ShopProduct;
  nameVal: string;
  strip: [string, NumFieldKey, number | null][];
  numVal: (k: NumFieldKey, fallback: number | null) => string;
  specRows: SpecRowDef[];
  fields: ProductFieldDraft;
  onEditField: (patch: Partial<ProductFieldDraft>) => void;
  onClose: () => void;
}) {
  const field =
    "w-full min-w-0 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm font-semibold text-brand-deep focus:border-brand focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="product-details-dialog"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h3 className="text-base font-bold text-ink">Edit product details</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink/70">Product name</span>
            <input
              aria-label="Product name"
              value={nameVal}
              onChange={(e) => onEditField({ name: e.target.value })}
              className={field}
            />
          </label>

          <div className="grid grid-cols-5 gap-2">
            {strip.map(([label, key, val]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-center text-[10px] font-bold uppercase tracking-wide text-ink/45">
                  {label}
                </span>
                <input
                  aria-label={label.replace("%", " %")}
                  inputMode="decimal"
                  value={numVal(key, val)}
                  onChange={(e) => onEditField({ [key]: e.target.value })}
                  className={`${field} px-1 text-center tabular-nums`}
                />
              </label>
            ))}
          </div>

          {specRows.map((row) => (
            <label key={row.label} className="block">
              <span className="text-xs font-semibold text-ink/70">{row.label}</span>
              <SpecFieldEditor row={row} fields={fields} product={p} onChange={onEditField} />
            </label>
          ))}

          {/* Extra sellable pack sizes (v0 — see packLabels/manage.ts): the
              buyer picks one of these beside the price, like choosing a
              T-shirt size. p.pack_size_grams (the required CSV field) is
              always included automatically; add more here. */}
          <label className="block">
            <span className="text-xs font-semibold text-ink/70">
              Additional pack sizes (g) — comma-separated
            </span>
            <input
              aria-label="Additional pack sizes"
              placeholder="e.g. 10, 20, 50"
              value={fields.pack_sizes ?? p.packSizes.join(", ")}
              onChange={(e) => onEditField({ pack_sizes: e.target.value })}
              className={field}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Spec-row field editor (edit mode, F-05) ───────────────────────────────────
// One row of the spec-row form: text / enum-select / boolean-checkbox / the
// two-input Lineage pair. Controlled by the draft overlay (falls back to the
// product's own value); every change reports UP via onChange — this component
// never writes anything itself, matching the strip's contract exactly.
function SpecFieldEditor({
  row, fields, product: p, onChange,
}: {
  row: SpecRowDef;
  fields: ProductFieldDraft;
  product: ShopProduct;
  onChange: (patch: Partial<ProductFieldDraft>) => void;
}) {
  if (row.kind === "text") {
    const val = fields[row.key] ?? (p[row.key] ?? "");
    return (
      <input
        aria-label={row.label}
        value={val}
        onChange={(e) => onChange({ [row.key]: e.target.value })}
        className={specField}
      />
    );
  }
  if (row.kind === "enum") {
    const val = fields[row.key] ?? (p[row.key] ?? "");
    return (
      <select
        aria-label={row.label}
        value={val}
        onChange={(e) => onChange({ [row.key]: e.target.value })}
        className={specField}
      >
        <option value="">n.a.</option>
        {row.codes.map((c) => (
          <option key={c} value={c}>{row.labelMap[c] ?? c}</option>
        ))}
      </select>
    );
  }
  if (row.kind === "bool") {
    const val = fields.resealable ?? (p.resealable ?? false);
    return (
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <input
          type="checkbox"
          aria-label={row.label}
          checked={val}
          onChange={(e) => onChange({ resealable: e.target.checked })}
        />
        {val ? "Yes" : "No"}
      </label>
    );
  }
  // Lineage — two independent parent fields side by side, one row.
  return (
    <div className="flex flex-1 gap-1">
      <input
        aria-label="Lineage A"
        placeholder="Lineage A"
        value={fields.lineage_parent_a ?? (p.lineage_parent_a ?? "")}
        onChange={(e) => onChange({ lineage_parent_a: e.target.value })}
        className={`${specField} w-1/2`}
      />
      <input
        aria-label="Lineage B"
        placeholder="Lineage B"
        value={fields.lineage_parent_b ?? (p.lineage_parent_b ?? "")}
        onChange={(e) => onChange({ lineage_parent_b: e.target.value })}
        className={`${specField} w-1/2`}
      />
    </div>
  );
}

// ── Batch editor (edit mode) ──────────────────────────────────────────────────
// Add / edit / delete lots inline, all PENDING until Save. Live lots read
// draft.batchEdits over the product's values (minus draft.batchDeletes); pending
// inserts render from draft.batchInserts. Every change reports up — nothing writes.
const lotField =
  "rounded border border-ink/15 bg-white px-1 py-0.5 text-[11px] tabular-nums focus:border-brand focus:outline-none";

function BatchEditor({
  product: p,
  draft,
  onInsert,
  onChange,
  onRemove,
}: {
  product: ShopProduct;
  draft?: ProductDraft;
  onInsert?: (productId: string) => void;
  onChange?: (productId: string, ref: BatchRef, patch: PendingBatchEdit) => void;
  onRemove?: (productId: string, ref: BatchRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const deletes = new Set(draft?.batchDeletes ?? []);
  const liveLots = p.batches.filter((b) => !deletes.has(b.id));
  const inserts = draft?.batchInserts ?? [];
  const total = liveLots.length + inserts.length;

  const liveVal = (b: ShopProduct["batches"][number], k: keyof PendingBatchEdit, fallback: string) =>
    draft?.batchEdits[b.id]?.[k] ?? fallback;

  return (
    <div className="mt-1.5 border-t border-ink/10 pt-1.5">
      <button
        type="button"
        data-testid="batch-editor-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-xs font-bold text-brand-deep"
      >
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
        Batches ({total})
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pb-1">
          {liveLots.map((b) => (
            <LotRow
              key={b.id}
              batchNumber={liveVal(b, "batch_number", b.batch_number)}
              thc={liveVal(b, "thc_percent", numStr(b.thc_percent))}
              cbd={liveVal(b, "cbd_percent", numStr(b.cbd_percent))}
              expiry={liveVal(b, "expiry_date", b.expiry_date ?? "")}
              onChange={(patch) => onChange?.(p.id, { kind: "existing", batchId: b.id }, patch)}
              onRemove={() => onRemove?.(p.id, { kind: "existing", batchId: b.id })}
            />
          ))}
          {inserts.map((nb) => (
            <LotRow
              key={nb.tempId}
              batchNumber={nb.batch_number}
              thc={nb.thc_percent}
              cbd={nb.cbd_percent}
              expiry={nb.expiry_date}
              onChange={(patch) => onChange?.(p.id, { kind: "new", tempId: nb.tempId }, patch)}
              onRemove={() => onRemove?.(p.id, { kind: "new", tempId: nb.tempId })}
            />
          ))}
          <button
            type="button"
            data-testid="add-lot-btn"
            onClick={() => { setOpen(true); onInsert?.(p.id); }}
            className="flex items-center gap-1 self-start rounded-md bg-brand/10 px-2 py-1 text-[11px] font-bold text-brand-deep hover:bg-brand/20"
          >
            <Plus size={12} /> Add lot
          </button>
        </div>
      )}
    </div>
  );
}

/** One editable lot row (a live lot or a pending insert — same shape). */
function LotRow({
  batchNumber, thc, cbd, expiry, onChange, onRemove,
}: {
  batchNumber: string;
  thc: string;
  cbd: string;
  expiry: string;
  onChange: (patch: PendingBatchEdit) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white/70 p-1">
      <input
        aria-label="Lot number" placeholder="Lot no" value={batchNumber}
        onChange={(e) => onChange({ batch_number: e.target.value })}
        className={`${lotField} w-20`}
      />
      <input
        aria-label="Lot THC %" placeholder="THC" inputMode="decimal" value={thc}
        onChange={(e) => onChange({ thc_percent: e.target.value })}
        className={`${lotField} w-12`}
      />
      <input
        aria-label="Lot CBD %" placeholder="CBD" inputMode="decimal" value={cbd}
        onChange={(e) => onChange({ cbd_percent: e.target.value })}
        className={`${lotField} w-12`}
      />
      <input
        aria-label="Lot expiry" type="date" value={expiry}
        onChange={(e) => onChange({ expiry_date: e.target.value })}
        className={`${lotField} flex-1`}
      />
      <button
        type="button" aria-label="Remove lot" onClick={onRemove}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-rose-500 hover:bg-rose-50"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Batch picker (non-edit, owner) — SELECTION ONLY ───────────────────────────
// Lists the product's lots for selection; the send flow is Phase 17 (this feeds
// the future basket). No quantities — the shop has no per-product stock yet.
function BatchPicker({ product: p }: { product: ShopProduct }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mt-1.5 border-t border-ink/10 pt-1.5">
      <button
        type="button"
        data-testid="batch-picker-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-xs font-semibold text-ink/70"
      >
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
        Select batch <span className="text-ink/40">(optional)</span>
      </button>
      {open && (
        <div data-testid="batch-picker-panel" className="flex flex-col gap-1 pb-1">
          {p.batches.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={selected === b.id}
              onClick={() => setSelected((s) => (s === b.id ? null : b.id))}
              className={`flex flex-col items-start rounded-lg px-2 py-1 text-left text-[11px] ${
                selected === b.id ? "bg-brand/10 ring-1 ring-brand/40" : "bg-white/60 hover:bg-white"
              }`}
            >
              <span className="font-bold text-brand-deep">{b.batch_number}</span>
              <span className="text-ink/55">
                THC {na(b.thc_percent)}% · CBD {na(b.cbd_percent)}% · exp {b.expiry_date ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
