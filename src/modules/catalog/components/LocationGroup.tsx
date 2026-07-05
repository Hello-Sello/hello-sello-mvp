"use client";

/**
 * A thin per-location divider header wrapping a 4-up card grid. Products in the
 * Present shop are grouped under one of these per location; the header shows the
 * location name and how many products sit in it.
 *
 * Display-only for now: the edit-mode drag-to-move-between-groups drop behavior
 * arrives with the card-back plan. Reusable via the catalog barrel.
 */
import { MapPin } from "lucide-react";

export function LocationGroup({
  location,
  count,
  children,
}: {
  /** The group label (a warehouse/shop location, or "Unassigned"). */
  location: string;
  /** How many products are in this group — shown as a small count badge. */
  count: number;
  /** Reserved for the edit-mode drop target (later plan); unused in display mode. */
  editing?: boolean;
  /** The ProductCards for this location. */
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 flex flex-col gap-3">
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
        style={{
          background: "linear-gradient(90deg, color-mix(in srgb, var(--color-brand) 13%, transparent), transparent 62%)",
          boxShadow: "inset 4px 0 0 var(--color-brand)",
        }}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-deep">
          <MapPin size={14} />
        </span>
        <b className="text-[15px] font-bold tracking-tight text-ink">{location}</b>
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brand/10 px-1.5 text-[11px] font-bold text-brand-deep">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
