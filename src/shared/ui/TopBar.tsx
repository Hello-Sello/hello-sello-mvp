"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { getCompanyChrome } from "@/app/account/actions";

/**
 * Top bar over the content area. Search on the left, the logged-in company on
 * the right. The company logo + name is fetched client-side (AppShell is
 * "use client", so this component cannot be async-server — mirror IconRail
 * useEffect pattern). Falls back to initials badge when logo is unavailable.
 *
 * The notification bell is a UI placeholder — the future home for deal
 * accept/decline requests. No unread dot until real notifications exist.
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

        {chrome?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chrome.logoUrl}
            alt={chrome.name}
            className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-xs font-bold text-white shadow-sm">
            {chrome ? initials(chrome.name) : "…"}
          </span>
        )}

        <span className="text-sm font-semibold text-ink">
          {chrome?.name ?? ""}
        </span>
      </div>
    </header>
  );
}
