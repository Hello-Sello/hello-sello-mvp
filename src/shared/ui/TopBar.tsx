import { Search } from "lucide-react";

/**
 * Top bar over the content area. Search on the left, the logged-in company on
 * the right. Static for 1a - search is a visual placeholder and the company is
 * seeded text (wired to real auth when Muskan's F3 lands).
 */
export function TopBar() {
  return (
    <header className="glass-strong z-10 m-3 mb-0 flex h-14 items-center gap-4 rounded-2xl px-4">
      <div className="flex w-full max-w-xl items-center gap-2 rounded-full bg-white/55 px-4 py-2 text-sm text-ink/40">
        <Search size={16} strokeWidth={1.75} />
        Search for company, product or service...
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-xs font-bold text-white shadow-sm">
          AD
        </span>
        <span className="text-sm font-semibold text-ink">
          Aurora Deutschland GmbH
        </span>
      </div>
    </header>
  );
}
