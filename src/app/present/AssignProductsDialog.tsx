"use client";

/**
 * "Assign products to shop" dialog — a fast way to place products that sit in no
 * shop yet WITHOUT the long scroll-and-drag down the live grid. Two panes:
 *   • LEFT  — every product with no location (draggable rows). It is also a drop
 *             target, so dragging a card back here clears its shop.
 *   • RIGHT — one column per shop, each a drop target listing the products in it.
 *             This is also where shops themselves are MANAGED: drag a column by
 *             its grip to re-arrange, or click the pencil to rename. It is the
 *             only screen that shows shops AS shops rather than as headings over
 *             products, so it is where editing them belongs.
 *
 * Every action commits IMMEDIATELY (no batching, no separate Save — identical to
 * the grid's on-page drag), then calls `onChanged` to re-pull the shop. Note "+
 * Add shop" here creates a REAL shop straight away, unlike the grid's staging: a
 * shop you cannot order or rename until it has products in it would be useless.
 */
import { useState } from "react";
import { X, Plus, MapPin, PackageOpen, GripVertical, Pencil, Check } from "lucide-react";
import type { ShopProduct, ShopLocation } from "@/modules/catalog";
import {
  setProductLocation, createShopLocation, renameShopLocation, setShopLocationOrder,
} from "@/modules/catalog/manage";
import { moveRelative } from "./locationFilter";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

const PRODUCT_MIME = "application/product-id";
// A shop drag and a product drag both land on a column, so they need distinct
// payload types — otherwise re-arranging shops would read as "move a product".
const SHOP_MIME = "application/shop-id";

/** A column in the right pane. `id` is null for a label that has no shop row yet
 *  — a grid-staged one, or a leftover label from before shops became rows. Those
 *  still accept drops, but cannot be renamed or re-arranged until they are real. */
type Column = { id: string | null; name: string };

/** The columns the right pane offers: real shops in the seller's chosen order
 *  first, then any label that products or the grid still refer to without a row.
 *  The second list should normally be empty — it exists so a product can never
 *  become invisible here just because its label lost its row. */
function shopColumns(
  shops: ShopLocation[],
  products: ShopProduct[],
  staged: string[],
): Column[] {
  const columns: Column[] = shops.map((s) => ({ id: s.id, name: s.name }));
  const known = new Set(shops.map((s) => s.name));
  for (const label of [...products.map((p) => p.location), ...staged]) {
    if (label && !known.has(label)) {
      known.add(label);
      columns.push({ id: null, name: label });
    }
  }
  return columns;
}

export function AssignProductsDialog({
  open,
  onClose,
  products,
  shops,
  stagedLocations,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** Every product in the shop — the dialog derives the unassigned list + the
   *  per-shop columns from this, and re-reads it after each move via onChanged. */
  products: ShopProduct[];
  /** The seller's real shops, already in their chosen display order. */
  shops: ShopLocation[];
  /** Grid-staged labels that have no shop row yet. */
  stagedLocations: string[];
  /** Re-pull the shop after an immediate move (router.refresh). */
  onChanged: () => void;
}) {
  const [newShop, setNewShop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!open) return null;

  const unassigned = products.filter((p) => p.location === null);
  const columns = shopColumns(shops, products, stagedLocations);

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

  async function addShop() {
    const v = newShop.trim();
    if (!v) return;
    setError(null);
    const res = await createShopLocation(v);
    if ("error" in res) { setError(res.error); return; }
    setNewShop("");
    onChanged();
  }

  async function renameShop(id: string, name: string) {
    setError(null);
    const res = await renameShopLocation(id, name);
    if ("error" in res) { setError(res.error); return; }
    onChanged();
  }

  /** Re-arrange shops by dropping one column onto another. Reuses the grid's own
   *  moveRelative so "what does a drop mean" is answered once, not twice. */
  async function reorderShops(draggedId: string, targetId: string) {
    const ids = shops.map((s) => s.id);
    const next = moveRelative(ids, draggedId, targetId, "before");
    if (next === ids) return;
    setError(null);
    const res = await setShopLocationOrder(next);
    if ("error" in res) { setError(res.error); return; }
    onChanged();
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addShop(); } }}
                className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => void addShop()}
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
                  {columns.map((col) => (
                    <ShopColumn
                      key={col.id ?? `staged:${col.name}`}
                      shop={col}
                      products={products.filter((p) => p.location === col.name)}
                      pendingId={pendingId}
                      onDropTo={onDropTo}
                      onRename={renameShop}
                      onReorder={reorderShops}
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

// A drop column for one shop. It carries three jobs: accept product drops, be
// dragged to re-arrange the shops, and rename itself in place. A column with no
// shop row yet (id === null) does only the first — there is nothing to rename.
function ShopColumn({
  shop,
  products,
  pendingId,
  onDropTo,
  onRename,
  onReorder,
}: {
  shop: { id: string | null; name: string };
  products: ShopProduct[];
  pendingId: string | null;
  onDropTo: (location: string | null) => (e: React.DragEvent) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shop.name);
  const id = shop.id;

  function commitRename() {
    const v = draft.trim();
    setEditing(false);
    if (id === null || !v || v === shop.name) return;
    onRename(id, v);
  }

  return (
    <div
      data-testid="shop-column"
      data-shop={shop.name}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        // A shop drag and a product drag both land here; the payload type says
        // which one this is, so re-arranging never reads as "move a product".
        const draggedShop = e.dataTransfer.getData(SHOP_MIME);
        if (draggedShop) {
          e.preventDefault();
          if (id !== null) onReorder(draggedShop, id);
          return;
        }
        onDropTo(shop.name)(e);
      }}
      className={`flex min-h-[140px] flex-col gap-1.5 rounded-2xl border-2 border-dashed p-2.5 transition ${
        over ? "border-brand bg-brand/[0.06]" : "border-ink/15 bg-ink/[0.02]"
      }`}
    >
      <div className="flex items-center gap-1.5 px-1 pb-1 text-sm font-bold text-ink">
        {id !== null && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(SHOP_MIME, id);
              e.dataTransfer.effectAllowed = "move";
            }}
            data-testid="shop-drag-handle"
            aria-label={`Re-arrange ${shop.name}`}
            className="cursor-grab text-ink/30 hover:text-ink/60 active:cursor-grabbing"
          >
            <GripVertical size={13} />
          </span>
        )}
        <MapPin size={13} className="text-brand" />
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              aria-label={`New name for ${shop.name}`}
              data-testid="shop-rename-input"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
              }}
              className="min-w-0 flex-1 rounded-md border border-brand bg-white px-1.5 py-0.5 text-sm font-semibold outline-none"
            />
            <button
              type="button"
              onClick={commitRename}
              data-testid="shop-rename-save"
              aria-label="Save shop name"
              className="rounded p-0.5 text-brand hover:bg-brand/10"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Cancel rename"
              className="rounded p-0.5 text-ink/40 hover:bg-ink/5"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{shop.name}</span>
            {id !== null && (
              <button
                type="button"
                onClick={() => { setDraft(shop.name); setEditing(true); }}
                data-testid="shop-rename-btn"
                aria-label={`Rename ${shop.name}`}
                className="rounded p-0.5 text-ink/35 hover:bg-ink/5 hover:text-ink/70"
              >
                <Pencil size={12} />
              </button>
            )}
            <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand/10 px-1.5 text-[11px] font-bold text-brand-deep">
              {products.length}
            </span>
          </>
        )}
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
