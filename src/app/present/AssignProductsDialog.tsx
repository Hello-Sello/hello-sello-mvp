"use client";

/**
 * "Assign products to shop" dialog — a fast way to place products that sit in no
 * shop yet WITHOUT the long scroll-and-drag down the live grid. Two panes:
 *   • LEFT  — every product with no location (draggable rows). It is also a drop
 *             target, so dragging a card back here clears its shop.
 *   • RIGHT — one column per shop (real groups + client-staged ones), each a drop
 *             target that lists the products already in it. A "+ new shop" input
 *             at the top stages a fresh column on the fly (same ephemeral staging
 *             as the grid's "+ Add shop").
 *
 * Every drop commits IMMEDIATELY through the existing `setProductLocation` (no
 * batching, no separate Save — identical to the grid's on-page drag), then calls
 * `onChanged` to re-pull the shop so both panes reflect the move. No new server
 * action, no schema change — this is purely a friendlier front door to the same
 * one location writer.
 */
import { useState } from "react";
import { X, Plus, MapPin, PackageOpen } from "lucide-react";
import type { ShopProduct } from "@/modules/catalog";
import { setProductLocation } from "@/modules/catalog/manage";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

const PRODUCT_MIME = "application/product-id";

/** Distinct named shop labels (first-seen order) followed by staged-but-empty
 *  ones, deduped — the columns the right pane offers as drop targets. */
function shopLabels(products: ShopProduct[], staged: string[]): string[] {
  const seen: string[] = [];
  for (const p of products) {
    if (p.location && !seen.includes(p.location)) seen.push(p.location);
  }
  for (const s of staged) {
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

export function AssignProductsDialog({
  open,
  onClose,
  products,
  stagedLocations,
  onAddLocation,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** Every product in the shop — the dialog derives the unassigned list + the
   *  per-shop columns from this, and re-reads it after each move via onChanged. */
  products: ShopProduct[];
  /** Client-staged shop labels with no products yet (from ShopView). */
  stagedLocations: string[];
  /** Stage a brand-new shop label (mirrors the grid's "+ Add shop"). */
  onAddLocation: (label: string) => void;
  /** Re-pull the shop after an immediate move (router.refresh). */
  onChanged: () => void;
}) {
  const [newShop, setNewShop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!open) return null;

  const unassigned = products.filter((p) => p.location === null);
  const columns = shopLabels(products, stagedLocations);

  async function move(productId: string, location: string | null) {
    setPendingId(productId);
    setError(null);
    const res = await setProductLocation(productId, location);
    setPendingId(null);
    if ("error" in res) { setError(res.error); return; }
    onChanged();
  }

  function onDropTo(location: string | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(PRODUCT_MIME);
      if (id) void move(id, location);
    };
  }

  function addShop() {
    const v = newShop.trim();
    if (!v) return;
    onAddLocation(v);
    setNewShop("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid="assign-products-dialog"
    >
      <div
        className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Assign products to shop</h2>
            <p className="text-xs text-ink/55">
              Drag a product from the left into a shop on the right. Changes save instantly.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[300px_1fr]">
          {/* ---------- LEFT: unassigned pool (also a drop target → clears shop) ---------- */}
          <div
            className="flex min-h-0 flex-col border-b border-ink/10 md:border-b-0 md:border-r"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropTo(null)}
            data-testid="unassigned-pane"
          >
            <div className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-ink">
              <PackageOpen size={15} className="text-brand" />
              Not in a shop
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand/10 px-1.5 text-[11px] font-bold text-brand-deep">
                {unassigned.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-auto px-3 pb-4">
              {unassigned.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-ink/40">
                  Every product is in a shop. 🎉
                </p>
              ) : (
                unassigned.map((p) => (
                  <ProductRow key={p.id} product={p} dimmed={pendingId === p.id} />
                ))
              )}
            </div>
          </div>

          {/* ---------- RIGHT: one drop column per shop ---------- */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 px-5 py-3">
              <input
                value={newShop}
                placeholder="+ New shop (e.g. Berlin)"
                aria-label="New shop name"
                onChange={(e) => setNewShop(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addShop(); } }}
                className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={addShop}
                data-testid="dialog-add-shop"
                className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-deep"
              >
                <Plus size={14} /> Add shop
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {columns.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-ink/40">
                  No shops yet — add one above, then drag products into it.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {columns.map((label) => (
                    <ShopColumn
                      key={label}
                      label={label}
                      products={products.filter((p) => p.location === label)}
                      pendingId={pendingId}
                      onDropTo={onDropTo}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A drop column for one shop — lists the products already in it and accepts drops.
function ShopColumn({
  label,
  products,
  pendingId,
  onDropTo,
}: {
  label: string;
  products: ShopProduct[];
  pendingId: string | null;
  onDropTo: (location: string | null) => (e: React.DragEvent) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid="shop-column"
      data-shop={label}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDropTo(label)(e); }}
      className={`flex min-h-[140px] flex-col gap-1.5 rounded-2xl border-2 border-dashed p-2.5 transition ${
        over ? "border-brand bg-brand/[0.06]" : "border-ink/15 bg-ink/[0.02]"
      }`}
    >
      <div className="flex items-center gap-1.5 px-1 pb-1 text-sm font-bold text-ink">
        <MapPin size={13} className="text-brand" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand/10 px-1.5 text-[11px] font-bold text-brand-deep">
          {products.length}
        </span>
      </div>
      {products.length === 0 ? (
        <p className="grid flex-1 place-items-center py-3 text-center text-xs text-ink/35">
          Drop products here
        </p>
      ) : (
        products.map((p) => <ProductRow key={p.id} product={p} dimmed={pendingId === p.id} compact />)
      )}
    </div>
  );
}

// A draggable product chip — thumbnail + name. Shown in both panes; the drag
// payload is just the product id (the same MIME the grid's card grip sets).
function ProductRow({
  product: p,
  dimmed = false,
  compact = false,
}: {
  product: ShopProduct;
  dimmed?: boolean;
  compact?: boolean;
}) {
  const thumb = p.images[0]?.path ? mediaUrl(p.images[0].path) : null;
  return (
    <div
      draggable
      data-testid="assign-product-row"
      onDragStart={(e) => {
        e.dataTransfer.setData(PRODUCT_MIME, p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`flex cursor-grab items-center gap-2 rounded-xl border border-ink/10 bg-white px-2 py-1.5 shadow-sm active:cursor-grabbing ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <span className={`shrink-0 overflow-hidden rounded-lg bg-brand-soft/40 ${compact ? "h-7 w-7" : "h-9 w-9"}`}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[9px] font-bold text-brand-deep/60">
            {(p.cultivar ?? p.name).slice(0, 2)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
    </div>
  );
}
