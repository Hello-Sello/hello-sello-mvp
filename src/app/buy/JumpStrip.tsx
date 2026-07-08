"use client";

/**
 * Jump strip for the Buy page's one continuously-scrolling page (Phase 18,
 * BUY-01) — mirrors `src/app/sell/JumpStrip.tsx` exactly: no tabs, only
 * anchors, each pill smooth-scrolls to its section. The KPI strip is not a
 * jump target (18-CONTEXT.md / 18-13-PLAN.md) — only the three real sections
 * below it are.
 */
const SECTIONS = [
  { id: "deals-section", label: "Deals timeline" },
  { id: "analytics-section", label: "Analytics" },
  { id: "sella-section", label: "Buyer-Sella" },
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
