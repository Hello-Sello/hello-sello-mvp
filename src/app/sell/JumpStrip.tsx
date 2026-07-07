"use client";

/**
 * Jump strip for the Allocate page's one continuously-scrolling page
 * (Sell/Allocate surface, DEV-76) — mirrors the prototype's jump-chip
 * behavior, but with no tab-switching state to manage: this page has no
 * tabs, only anchors, so each pill just smooth-scrolls to its section.
 */
const SECTIONS = [
  { id: "orders-section", label: "Orders & offers" },
  { id: "batches-section", label: "Batches" },
  { id: "calendar-section", label: "Sales calendar" },
] as const;

export function JumpStrip() {
  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => jumpTo(s.id)}
          className="rounded-full bg-ink/5 px-3.5 py-1.5 text-[12px] font-bold text-ink-muted transition-colors hover:bg-ink/10"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
