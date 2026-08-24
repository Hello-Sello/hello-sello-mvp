"use client";

/**
 * A per-location divider header wrapping a 4-up card grid. Products in the Present
 * shop group under one of these per location; the header shows the location name
 * and how many products sit in it.
 *
 * In edit mode the section becomes a drop target for two native-DnD payloads:
 *   • a PRODUCT card (dragged by its grip) → `setProductLocation` persists the
 *     move to this group's location (D-04), then `onChanged` re-pulls the shop;
 *   • a GROUP header (dragged by this header) → `onReorder` reorders the sections
 *     client-side (a custom persisted group order is Phase 16 — structured
 *     locations own ordering, so nothing is written here).
 * Reusable via the catalog barrel.
 */
import { useState } from "react";
import { MapPin } from "lucide-react";
import { setProductLocation } from "../manage";

export function LocationGroup({
  location,
  targetLocation = location,
  count,
  editing = false,
  showHeader = true,
  onChanged,
  onReorder,
  children,
}: {
  /** The group label (a warehouse/shop location, or "Unassigned"). */
  location: string;
  /** The value to persist when a card is dropped here — the caller maps the
   *  synthetic "Unassigned" bucket to null. Defaults to the label. */
  targetLocation?: string | null;
  /** How many products are in this group — shown as a small count badge. */
  count: number;
  /** When true, the section accepts card-move + header-reorder drops. */
  editing?: boolean;
  /** Whether to render the divider header (label, count badge, drop hint).
   *  Defaults TRUE — /present is unchanged. A caller filtered to ONE named
   *  location suppresses it: the header would repeat a name the filter control
   *  already shows, and a divider between one group divides nothing. The drop
   *  target is the <section>, not the header, so hiding it costs no capability. */
  showHeader?: boolean;
  /** Called after a card is moved into this group (re-pull the shop). */
  onChanged?: () => void;
  /** Reorder the sections: move `from` before this group (`to`). Client-only. */
  onReorder?: (from: string, to: string) => void;
  /** The ProductCards for this location. */
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  async function handleDrop(e: React.DragEvent) {
    if (!editing) return;
    e.preventDefault();
    setOver(false);

    const productId = e.dataTransfer.getData("application/product-id");
    if (productId) {
      const from = e.dataTransfer.getData("application/product-loc"); // "" for null
      if (from === (targetLocation ?? "")) return; // already in this group
      const res = await setProductLocation(productId, targetLocation);
      if (!("error" in res)) onChanged?.();
      return;
    }

    const fromGroup = e.dataTransfer.getData("application/group-loc");
    if (fromGroup && fromGroup !== location) onReorder?.(fromGroup, location);
  }

  return (
    <section
      className={`mb-6 flex flex-col gap-3 rounded-2xl transition ${
        over ? "outline-2 outline-dashed outline-brand/60" : ""
      }`}
      onDragOver={editing ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={editing ? () => setOver(false) : undefined}
      onDrop={editing ? handleDrop : undefined}
    >
      {showHeader && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          draggable={editing}
          onDragStart={
            editing
              ? (e) => {
                  e.dataTransfer.setData("application/group-loc", location);
                  e.dataTransfer.effectAllowed = "move";
                }
              : undefined
          }
          style={{
            background: "linear-gradient(90deg, color-mix(in srgb, var(--color-brand) 13%, transparent), transparent 62%)",
            boxShadow: "inset 4px 0 0 var(--color-brand)",
            cursor: editing ? "grab" : undefined,
          }}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-deep">
            <MapPin size={14} />
          </span>
          <b className="text-[15px] font-bold tracking-tight text-ink">{location}</b>
          <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand/10 px-1.5 text-[11px] font-bold text-brand-deep">
            {count}
          </span>
          {editing && (
            <span className="ml-auto text-[10px] font-semibold text-ink/40">drop products here to move them</span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
