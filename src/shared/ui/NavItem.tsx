import Link from "next/link";
import type { Surface } from "./surfaces";

/**
 * One pill in the light glass rail. Three visual states:
 *   - active: cotton-candy glass fill, raspberry icon + text, raspberry edge bar
 *   - idle:   muted ink, hover lifts toward brand
 *   - soon:   greyed, non-clickable (rendered as a <span>)
 */
export function NavItem({
  surface,
  isActive,
}: {
  surface: Surface;
  isActive: boolean;
}) {
  const Icon = surface.icon;

  const base =
    "group relative flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-[10px] font-medium leading-none transition-all duration-200";

  if (surface.state === "soon") {
    return (
      <span
        className={`${base} cursor-not-allowed select-none text-ink/30`}
        title={`${surface.label} - coming soon`}
        aria-disabled="true"
      >
        <Icon size={20} strokeWidth={1.75} className="opacity-40" />
        {surface.label}
      </span>
    );
  }

  return (
    <Link
      href={surface.href}
      aria-current={isActive ? "page" : undefined}
      className={`${base} ${
        isActive
          ? "bg-brand-soft/70 text-brand shadow-[0_4px_14px_-6px_rgba(227,11,93,0.45)]"
          : "text-ink/55 hover:bg-white/55 hover:text-brand"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}
      <Icon size={20} strokeWidth={isActive ? 2.1 : 1.75} />
      {surface.label}
    </Link>
  );
}
