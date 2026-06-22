"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { getCompanyChrome } from "@/app/account/actions";

/**
 * Top chrome over the content area (F2). A full-width glass bar so the top of the
 * page reads as a real bar (not a floating pill): a clear, stretched search field
 * fills the centre, and the notification bell + the logged-in company sit in a
 * roomy cluster on the right.
 *
 * The company logo + name is fetched client-side (AppShell is "use client", so
 * this component cannot be async-server - mirror IconRail's useEffect pattern).
 * Falls back to an initials badge when the logo is unavailable. The bell is a
 * UI placeholder - the future home for deal accept/decline requests; no unread
 * dot until real notifications exist.
 */

type Chrome = { name: string; logoUrl: string | null } | null;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TopBar() {
  const [chrome, setChrome] = useState<Chrome>(null);

  useEffect(() => {
    getCompanyChrome().then(setChrome);
  }, []);

  return (
    <header className="glass-strong z-10 mx-3 mt-3 flex h-12 items-center gap-4 rounded-2xl px-3">
      {/* search - a clear, stretched field so the bar reads as a real bar */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-white/75 px-4 py-2 text-sm text-ink/45 shadow-sm ring-1 ring-black/[0.06]">
        <Search size={16} strokeWidth={1.75} className="shrink-0 text-ink/45" />
        <span className="truncate">Search for company, product or service...</span>
      </div>

      {/* right cluster - notification + company, given room */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications - coming soon"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink/45 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand motion-reduce:transition-none"
        >
          <Bell size={18} strokeWidth={1.75} />
        </button>

        <div className="flex items-center gap-2.5 rounded-xl bg-white/55 py-1 pl-1 pr-3.5 ring-1 ring-black/5">
          {chrome?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={chrome.logoUrl}
              alt={chrome.name}
              className="h-8 w-8 rounded-lg object-cover shadow-sm ring-1 ring-black/5"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white shadow-sm">
              {chrome ? initials(chrome.name) : "…"}
            </span>
          )}
          <span className="truncate text-sm font-semibold text-ink">
            {chrome?.name ?? ""}
          </span>
        </div>
      </div>
    </header>
  );
}
