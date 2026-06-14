import { Bell, Search } from "lucide-react";

/**
 * Top bar over the content area. Search on the left, the logged-in company on
 * the right. Static for 1a - search is a visual placeholder and the company is
 * seeded text (wired to real auth when Muskan's F3 lands).
 *
 * The notification bell (5A.2) is a UI placeholder - the future home for deal
 * accept/decline requests (so that action can leave the card, keeping it clean).
 * No unread dot until real notifications exist; a static dot would falsely claim
 * you have unread items. Marked "coming soon" via its tooltip.
 */
export function TopBar() {
  return (
    <header className="glass-strong z-10 m-3 mb-0 flex h-14 items-center gap-4 rounded-2xl px-4">
      <div className="flex w-full max-w-xl items-center gap-2 rounded-full bg-white/55 px-4 py-2 text-sm text-ink/40">
        <Search size={16} strokeWidth={1.75} />
        Search for company, product or service...
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications - coming soon"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/40 ring-1 ring-black/5 transition hover:bg-white/60 hover:text-brand"
        >
          <Bell size={17} strokeWidth={1.75} />
        </button>
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
