/**
 * SectionCard — the one glass panel every Discover section sits in, so they frame
 * identically (Variant D). Header = title + a plain muted count; the body holds the
 * section's content. `fill` makes the card a fixed-height flex column whose body
 * scrolls internally — that is how the side-by-side Requests / My Network duo stays
 * equal-height while each list scrolls on its own.
 *
 * (No "See all" link: the prototype's was a dead placeholder and there is no
 * see-all destination yet — an affordance that goes nowhere is worse than none.)
 */
import type { ReactNode } from "react";

export function SectionCard({
  title,
  count,
  fill = false,
  children,
}: {
  title: string;
  count?: number;
  /** fixed-height card with an internally-scrolling body (for the duo) */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`glass-strong overflow-hidden rounded-[20px] ${
        fill ? "flex flex-col md:h-[320px]" : ""
      }`}
    >
      <div className="flex items-baseline gap-2.5 px-[18px] pb-2.5 pt-4">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {count !== undefined && (
          <span className="text-[13px] font-medium text-ink-muted">{count}</span>
        )}
      </div>
      <div className={`px-[18px] pb-4 ${fill ? "flex-1 overflow-y-auto" : "pt-0.5"}`}>
        {children}
      </div>
    </section>
  );
}
