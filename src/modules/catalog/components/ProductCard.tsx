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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Heart, RotateCw, Minus, Plus, ShoppingCart, EyeOff, Eye,
  GripVertical, Trash2, ChevronLeft, ChevronRight, ChevronDown, X, Pencil,
  MessageSquareQuote, Check,
} from "lucide-react";
import type { ShopProduct } from "../shop";
import { packSizes, resolveTierPrice } from "../pricing";
import { ladderRows } from "../ladderPanel";
import { draftFromTiers, draftNumber, validateLadder } from "../ladderDraft";
import type { LadderRowDraft } from "../ladderDraft";
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
  /** The FULL tier-row draft (0021, T04) — every keystroke reports the whole
   *  array (shallow-merge safe). Undefined = ladder untouched → flush skips it;
   *  ShopView routes a present draft through saveLadder, never toFieldPatch. */
  tiers?: LadderRowDraft[];
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
  onReorder,
  viewerIsOwner = true,
  onRequestPricing,
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
  /** Reorder within the SAME shop: a card was dropped onto this one (dragged id,
   *  this card's id). Only same-location drops reach here — a cross-shop drop
   *  bubbles to the LocationGroup, which moves the location instead. Client-only. */
  onReorder?: (draggedId: string, targetId: string) => void;
  /** Does the viewer own this product's shop? Gates the buy row (ADR-0005 §6).
   *  DEFAULTS TO `true` — deliberately the privileged value, so that a caller
   *  which does not pass it behaves exactly as the card does today (every
   *  read-mode card renders the buy row). Defaulting to `false` would silently
   *  strip buy rows off price-hidden products on `/present`. The cost is the
   *  usual one for a privileged default: a future buyer-facing caller that
   *  forgets the prop gets owner behaviour with every test green. */
  viewerIsOwner?: boolean;
  /** Buyer asks the seller for a price on THIS product (price_public = false).
   *  The card only reports the intent; the WRITE lives with the caller — this
   *  card owns no server action. The caller MUST return the outcome, so the card
   *  can tell "landed" from "failed" and render the right thing in the ask's
   *  slot. Fire-and-forget is deliberately not expressible: a caller returning
   *  nothing would leave the card no choice but to assume "landed", which is a
   *  green confirmation for an ask that may never have landed — the exact defect
   *  this feedback exists to prevent. */
  onRequestPricing?: (productId: string) => Promise<{ ok: true } | { error: string }>;
}) {
  const [flipped, setFlipped] = useState(false);
  // Highlights this card as the drop target while a sibling from the same shop is
  // dragged over it (the insert-before hint for the reorder).
  const [reorderOver, setReorderOver] = useState(false);
  const [pack, setPack] = useState(0);
  const [qty, setQty] = useState(1);
  // Buyer "See all prices" popover (T05) — a floating layer portaled to the
  // body, anchored under the toggle link (G4 round 2). Closes on Choose, the
  // toggle, outside click, or Esc; on scroll/resize it FOLLOWS the link (it
  // may poke below the fold, so closing on scroll would fight the user's
  // attempt to bring it into view).
  const [pricesOpen, setPricesOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const repositionPanel = () => {
    const link = toggleRef.current;
    const cardEl = link?.closest('[data-testid="product-card"]');
    if (!link || !cardEl) return;
    const l = link.getBoundingClientRect();
    const c = cardEl.getBoundingClientRect();
    setPanelPos({ top: l.bottom + 4, left: c.left + 14, width: c.width - 28 });
  };
  useEffect(() => {
    if (!pricesOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // The toggle runs its own close — reacting here too would reopen it.
      if (t?.closest("[data-prices-toggle]") || panelRef.current?.contains(t as Node)) return;
      setPricesOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPricesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", repositionPanel, true);
    window.addEventListener("resize", repositionPanel);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", repositionPanel, true);
      window.removeEventListener("resize", repositionPanel);
    };
  }, [pricesOpen]);
  const [liked, setLiked] = useState(false);
  // Carousel index over p.images (wraps); busy guards the immediate actions.
  const [imgIdx, setImgIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  // Full-field edit dialog (edit mode): the same spec rows as the inline scroll
  // list, laid out full-size — feedback was that the cramped inline inputs are
  // hard to see/use. Reuses the same onEditField draft, not a second write path.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The pricing ask's outcome, card-local like `flipped` / `qty` / `pricesOpen`.
  // Nothing on the server re-derives it, so a reload restores the button — which
  // is correct: the dup-guard is server-side, and a second ask is refused there
  // rather than by the client hiding a control.
  const [asked, setAsked] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  async function askForPricing() {
    if (!onRequestPricing) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await onRequestPricing(p.id);
      if ("error" in res) {
        setAskError(res.error);
        return;
      }
      setAsked(true);
    } catch {
      // A REJECTED promise — transport failure, a 500 out of the Server Action,
      // a throw inside the caller. Without this the button would stay disabled
      // with no message: a permanently dead control.
      setAskError("We couldn't send that request. Please try again.");
    } finally {
      // In `finally` so every path re-enables the button, including the throw.
      setAsking(false);
    }
  }

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

  // Reorder-within-shop drop. Only same-location drops reorder; a drop from
  // another shop falls through (no stopPropagation) to LocationGroup, which
  // persists the location move instead. dataTransfer payloads are unreadable
  // during dragOver, so we always allow the drop and decide here on drop.
  function handleReorderDrop(e: React.DragEvent) {
    setReorderOver(false);
    const draggedId = e.dataTransfer.getData("application/product-id");
    if (!draggedId || draggedId === p.id) return;
    const from = e.dataTransfer.getData("application/product-loc"); // "" for null
    if (from !== (p.location ?? "")) return; // cross-shop → let LocationGroup handle it
    e.preventDefault();
    e.stopPropagation();
    onReorder?.(draggedId, p.id);
  }

  // Field draft accessors (controlled by the overlay, falling back to the product).
  const fields = draft?.fields ?? {};
  const nameVal = fields.name ?? p.name;
  const numVal = (k: NumFieldKey, fallback: number | null) => fields[k] ?? numStr(fallback);
  const pricePublic = fields.price_public ?? p.price_public;
  // Tier-ladder draft rows (T04): the drafted array, else the live rungs — the
  // same lazy-init pattern as numVal/nameVal. Validation runs against the base
  // the flush will use (drafted price when present, else the live price).
  const tierRows = fields.tiers ?? draftFromTiers(p.tiers);
  const ladderBase =
    fields.price_per_gram !== undefined ? draftNumber(fields.price_per_gram) : p.price_per_gram;

  // Carousel: current cover, wrapping through p.images (placeholder when empty).
  const images = p.images;
  const hasImages = images.length > 0;
  const idx = hasImages ? ((imgIdx % images.length) + images.length) % images.length : 0;
  const cover = hasImages ? mediaUrl(images[idx].path) : null;

  // The ONE size array (ADR-0004 §5): the same `packSizes()` output ShopView
  // resolves the reported index against — bubbles, Choose picks, and the
  // basket resolver can never disagree. `pack` indexes into THIS array.
  const sizes = packSizes(p, p.tiers);
  // The ONE currentGrams owner (T05 amendment 4): feeds the availability chip,
  // the headline price, and the panel's applied-row highlight. Guarded against
  // a stale `pack` index (sizes can shrink under an unchanged index).
  const gramsPerPack = sizes[pack]?.grams ?? null;
  const currentGrams = gramsPerPack == null ? null : gramsPerPack * qty;
  const resolved = resolveTierPrice(p.price_per_gram, p.tiers, currentGrams, "g");

  /** Choose a rung from the panel: pre-fill the basket controls to exactly the
   *  rung (its packSizes entry × qty 1 — every rung emits an entry), close. */
  function chooseRung(minGrams: number) {
    const i = sizes.findIndex((s) => s.grams === minGrams);
    if (i >= 0) {
      setPack(i);
      setQty(1);
    }
    setPricesOpen(false);
  }

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
    // OWNER ONLY. `supplier_product_code` is seller-confidential (G3), so the
    // buyer's RPC never projects it — leaving the row in rendered
    // `Supplier code — n.a.` on every buyer card, making a WITHHELD field
    // indistinguishable from an unset one. Ruled at T05's G4 (2026-08-22):
    // a confidential field should not advertise its own existence.
    ...(viewerIsOwner
      ? ([{ kind: "text", key: "supplier_product_code", label: "Supplier code", display: p.supplier_product_code ?? "n.a." }] as SpecRowDef[])
      : []),
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
  // The footer's one gate group (read them together, they are one decision).
  // `canBuy`: the owner keeps their controls on their own unpriced/hidden
  // products; a buyer only gets them when a price is actually on screen.
  const canBuy = !editing && (priceShown || viewerIsOwner);
  // `canAsk` keys off `pricePublic`, NOT off `!priceShown` — and the two are
  // therefore NOT strict complements. `priceShown` is also false when the price
  // is merely UNSET, and "price on request" (`price_public = false`) vs "price
  // not set yet" (`price_public = true`, null price) is a distinction the DB
  // keeps on purpose (`20260816190000:96-97`) and ADR-0005 `:566-567` forbids
  // collapsing. Consequence, intended: for a non-owner on a public-but-unpriced
  // product NEITHER control renders. Do not "fix" that into a complement.
  const canAsk = !editing && !viewerIsOwner && !pricePublic;
  // The open prices panel swaps in for the availability + buy rows (see the
  // footer) — one flag so the panel and the rows it replaces can't disagree.
  const panelShowing = pricesOpen && priceShown && p.tiers.length > 0;
  const flag = countryFlag(p.country_of_origin);

  return (
    <>
    <div
      data-testid="product-card"
      className={`relative h-[640px] rounded-3xl transition ${
        reorderOver ? "ring-2 ring-brand ring-offset-2" : ""
      }`}
      style={{ perspective: "1900px" }}
      onDragOver={editing && onReorder ? (e) => { e.preventDefault(); setReorderOver(true); } : undefined}
      onDragLeave={editing && onReorder ? () => setReorderOver(false) : undefined}
      onDrop={editing && onReorder ? handleReorderDrop : undefined}
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
                {/* `=== false`, not `!…`: `profile_visible` is optional (seller
                    state), and ABSENT must not read as hidden — a buyer-facing
                    mapper never carries it. */}
                {p.profile_visible === false && (
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
                height. min-h-[80px] is a hard floor (not min-h-0) — without it,
                a tall footer (e.g. edit mode's stacked price fields, or the batch
                picker) can flex-shrink this area to a sliver, hiding freshly
                edited/saved fields entirely (reported bug, 2026-07-07). 80px is
                the prototype's floor — the footer needs the rest so the tier
                editor's Add button and the open prices panel stay inside the
                fixed-height card (G4 round 2). The bottom fade cues that the
                list still scrolls past that floor. */}
            <div className="relative mt-1.5 flex min-h-[80px] flex-1 flex-col">
              <div className="speclist-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pb-7">
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
              {/* Bottom fade, ONE ROW tall (G4 item D). It is not the scroll
                  affordance — `.speclist-scroll` keeps a real scrollbar visible
                  for that. Its job is that a partly-visible row dissolves into
                  white instead of being cut through its glyphs, which is how the
                  Lineage row read at rest. Pairs with the list's `pb-7`: at the
                  end of the scroll that padding holds the last row clear of this
                  gradient, so nothing is ever hidden by it. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white via-white to-transparent" />
            </div>

            {/* footer: pack bubbles + price, then availability + stepper + Add.
                Read mode is sized to always fit (shrink-0); edit mode's stacked
                price fields + tier editor can exceed the card's spare height,
                so the whole edit footer scrolls instead of clipping its tail —
                "+ Add tier" stays reachable at any row/error count (G4 rd 2). */}
            <div
              className={`relative z-[5] border-t border-ink/10 bg-white px-3.5 pb-3 pt-2.5 ${
                editing ? "min-h-0 overflow-y-auto" : "shrink-0"
              }`}
            >
              <div className="mb-2 flex items-end justify-between gap-2.5">
                <PackSizeSelector sizes={sizes.map((s) => s.label)} selected={pack} onSelect={setPack} />
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
                    <>
                      <span className="text-right text-[17px] font-extrabold text-brand-deep tabular-nums">
                        <small className="-mb-0.5 block text-[10.5px] font-semibold text-ink-muted">Approx.</small>
                        {/* The APPLIED price at the current pack × qty (T05
                            amendment 3) — always agrees with the chip and the
                            panel highlight; falls back to base. With a rung
                            applied, the base price anchors above it struck
                            through (marketplace was/now pattern, G4 round 2);
                            the sr-only text carries what the strikethrough
                            alone doesn't announce. */}
                        {resolved.appliedMin != null && (
                          <s className="block text-xs font-semibold text-ink-muted/70">
                            <span className="sr-only">Base price </span>
                            {eur(p.price_per_gram as number)}
                          </s>
                        )}
                        {eur(resolved.pricePerGram ?? (p.price_per_gram as number))}<span className="text-xs">/g</span>
                      </span>
                      {p.tiers.length > 0 && (
                        <button
                          type="button"
                          ref={toggleRef}
                          data-prices-toggle
                          aria-expanded={pricesOpen}
                          onClick={() => {
                            if (!pricesOpen) repositionPanel();
                            setPricesOpen((v) => !v);
                          }}
                          className="text-[10.5px] font-bold text-brand underline underline-offset-2"
                        >
                          {pricesOpen ? "Hide prices" : "See all prices"}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand-deep">Price on request</span>
                  )}
                </div>
              </div>
              {/* Tier-ladder editor (T04): edit-only, below the price block. Rows
                  edit into the draft like every other card field — the ONE pink
                  Save flushes them (no per-editor Save; G4-recorded deviation). */}
              {editing && (
                <TierLadderEditor
                  rows={tierRows}
                  base={ladderBase}
                  onRows={(rows) => onEditField?.(p.id, { tiers: rows })}
                />
              )}
              {/* "See all prices" panel (T05): one row per ladderRows entry;
                  the applied row is tinted; the base row has no Choose. */}
              {panelShowing && panelPos && createPortal(
                /* A PORTALED POPOVER (G4 round 2, Muskan's call): it opens
                   BELOW the "Hide prices" link, and only ~100px of card
                   remain there — so it renders at document.body and may poke
                   past the card's bottom edge (the card face's overflow-hidden
                   would clip it in-tree). Nothing in the card moves; it stays
                   until Choose / "Hide prices" / outside click / Esc, and any
                   scroll closes it (its viewport position is captured at open,
                   not tracked). Solid background — it floats over the page. */
                <div
                  ref={panelRef}
                  role="dialog"
                  aria-label="Volume prices"
                  style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelPos.width }}
                  className="z-50 rounded-xl border border-brand/25 bg-white p-1.5 shadow-xl"
                >
                  {ladderRows(p.price_per_gram, p.tiers, currentGrams).map((row, i) => {
                    const min = row.minGrams;
                    return (
                      <div
                        key={min ?? "base"}
                        className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-[11.5px] ${
                          row.isApplied ? "bg-brand/10" : ""
                        } ${i > 0 ? "border-t border-dashed border-brand/20" : ""}`}
                      >
                        {/* nowrap — a wrapped label multiplies the row height
                            and re-clips the panel on narrow cards (G4 rd 2). */}
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap font-bold text-ink">
                          {row.label}
                          {row.savingPercent > 0 && (
                            <>
                              {" · "}
                              <span style={{ color: "#1d7a1c" }}>−{row.savingPercent}%</span>
                            </>
                          )}
                        </span>
                        <span className="font-extrabold text-brand-deep tabular-nums">
                          {eur(row.pricePerGram)}<span className="text-[10px]">/g</span>
                        </span>
                        {min != null && (
                          <button
                            type="button"
                            aria-label={`Choose from ${min}g`}
                            onClick={() => chooseRung(min)}
                            className="rounded-full border border-brand bg-white px-2.5 py-0.5 text-[10px] font-extrabold text-brand hover:bg-brand hover:text-white"
                          >
                            Choose
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>,
                document.body,
              )}
              {/* static availability indicator — a stock/availability field is a later
                  data-model addition; the shop currently has no per-product stock.
                  The chip beside it (T05 amendment 1, T06/T07 treatment) is gated
                  exactly like the reveal: hidden price ⇒ no chip either. */}
              <div className="mb-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" /> Available
                </span>
                {priceShown && p.tiers.length > 0 && (
                  resolved.appliedMin != null ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: "#1d7a1c", background: "rgba(52,178,51,.12)" }}
                    >
                      from {resolved.appliedMin}g applied
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
                      base price
                    </span>
                  )
                )}
              </div>
              {/* Buy row — read mode, and only where the viewer may actually buy
                  (see `canBuy`). In edit mode it was dead chrome (Add was
                  rendered disabled) and its ~48px is exactly what the tier
                  editor needs inside the fixed-height footer (G4 feedback). */}
              {canBuy && (
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
                    onClick={() => onAddToBasket?.(p.id, qty, pack)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-2 text-[12.5px] font-bold text-white hover:bg-brand-deep"
                  >
                    <ShoppingCart size={14} /> Add to basket
                  </button>
                </div>
              )}
              {/* Ask row — the seller DELIBERATELY hid this price, so the buyer
                  gets the one action that makes sense: ask for it. Occupies the
                  same footer slot the buy row would. NOT the buy row's strict
                  complement — see `canAsk`: a merely-unpriced public product
                  renders neither, on purpose (ADR-0005 §6). The accessible name
                  carries the product name so the ask names its subject (AC 3).
                  The handler is wired — `ShopView` passes `onRequestPricing`. */}
              {canAsk &&
                (asked ? (
                  /* The ask landed. A non-interactive confirmation takes the
                     button's own slot — there is nothing left to click, and
                     there is no toast primitive in src/shared/ui/ to invent
                     one for. */
                  <div
                    data-testid="pricing-requested"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full bg-success/15 py-2 text-[12.5px] font-bold text-success"
                  >
                    <Check size={14} /> Pricing requested
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      data-testid="request-pricing"
                      aria-label={`Request pricing for ${p.name}`}
                      onClick={askForPricing}
                      disabled={asking}
                      className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-[12.5px] font-bold text-brand-deep shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)] hover:bg-brand/5 disabled:opacity-60"
                    >
                      <MessageSquareQuote size={14} /> Request pricing
                    </button>
                    {/* The ask failed. The button stays above, still clickable —
                        a retry is the only useful next move. */}
                    {askError && (
                      <p className="mt-1 text-center text-[11px] font-medium text-danger">{askError}</p>
                    )}
                  </div>
                ))}
              {/* Batch selection lives in the footer, beside Add-to-basket — not
                  inside the scrollable spec list above (feedback: it was easy to
                  miss buried in the scroll). View mode only. NOT owner-gated,
                  despite what this comment used to claim: it is DATA-gated, and
                  buyers see no lots only because the buyer RPC returns none. If
                  that ever changes, lot data reaches buyers with nothing in this
                  card stopping it — the gate belongs here or in T05's mapper. */}
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

          {/* Extra sellable pack sizes (v0 — see packSizes/pricing.ts): the
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

// ── Tier-ladder editor (edit mode, 0021 T04) ──────────────────────────────────
// The prototype's footerEdit adapted to the card's pending-draft contract: rows
// are `from [min] g → [price] €/g ✕` (lot-row register), the whole row reds when
// invalid with the message line under it, `+ Add tier` is an advisory cap at 3
// (a direct 4th rung still renders; Add stays dead). Every change reports the
// FULL row array up — this component writes nothing itself.
function TierLadderEditor({
  rows,
  base,
  onRows,
}: {
  rows: LadderRowDraft[];
  base: number | null;
  onRows: (rows: LadderRowDraft[]) => void;
}) {
  const validation = validateLadder(rows, base);
  const full = rows.length >= 3;

  const editRow = (i: number, patch: Partial<LadderRowDraft>) =>
    onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="mb-2 rounded-xl bg-brand/[0.03] p-1.5">
      <div className="mb-1 px-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/45">
        Volume price tiers <span className="font-semibold normal-case text-ink/40">(max 3)</span>
      </div>
      {/* No inner scroll — the edit footer as a whole scrolls (G4 round 2),
          so rows and + Add tier flow naturally and stay reachable. */}
      <div className="flex flex-col gap-1 pr-0.5">
        {rows.map((row, i) => {
          const v = validation.rows[i];
          const invalid = v.minInvalid || v.priceInvalid;
          return (
            <div key={i}>
              <div
                className={`flex flex-wrap items-center gap-1 rounded-lg p-1 ${
                  invalid ? "bg-rose-50 ring-1 ring-rose-300" : "bg-white/70"
                }`}
              >
                <span className="text-[10px] font-semibold text-ink/50">from</span>
                <input
                  aria-label={`Tier ${i + 1} minimum grams`}
                  inputMode="decimal"
                  value={row.min}
                  onChange={(e) => editRow(i, { min: e.target.value })}
                  className={`${lotField} w-14`}
                />
                <span className="text-[10px] font-semibold text-ink/50">g →</span>
                <input
                  aria-label={`Tier ${i + 1} price per gram`}
                  inputMode="decimal"
                  value={row.price}
                  onChange={(e) => editRow(i, { price: e.target.value })}
                  className={`${lotField} w-14`}
                />
                <span className="text-[10px] font-semibold text-ink/50">€/g</span>
                <button
                  type="button"
                  aria-label={`Remove tier ${i + 1}`}
                  onClick={() => onRows(rows.filter((_, j) => j !== i))}
                  className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded text-rose-500 hover:bg-rose-50"
                >
                  <X size={13} />
                </button>
              </div>
              {v.message && (
                <div className="px-1.5 pt-0.5 text-[10px] font-semibold text-rose-600">{v.message}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          disabled={full}
          onClick={() => onRows([...rows, { min: "", price: "" }])}
          className="flex items-center gap-1 self-start rounded-md border border-dashed border-brand/50 px-2 py-1 text-[11px] font-bold text-brand-deep hover:bg-brand/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus size={12} /> Add tier
        </button>
        {full && <span className="text-[10px] font-semibold text-ink/40">ladder is full</span>}
      </div>
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
