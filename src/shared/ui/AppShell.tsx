"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { IconRail } from "./IconRail";

// Pre-login routes: rendered bare (no rail / top bar) since there is nothing to
// navigate to and no company to show until the user is signed in.
const BARE_ROUTES = ["/login", "/signup"];

/**
 * The frame every page sits inside: a full-height dark rail down the left, and
 * a content column (top bar + page) filling the rest. Composed in the root
 * layout, so all routes inherit it. The pink glass background lives on <body>.
 *
 * On auth routes it steps aside and renders the page alone (see BARE_ROUTES).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (bare) return <>{children}</>;

  return (
    <div className="flex h-full">
      <IconRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-3">{children}</main>
      </div>
    </div>
  );
}
