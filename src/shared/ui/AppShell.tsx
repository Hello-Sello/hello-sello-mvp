"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { IconRail } from "./IconRail";
import { BasketProvider } from "@/modules/basket";

// Routes rendered bare (no rail / top bar): the auth pages (nothing to navigate
// to pre-login), `/c/<handle>` public profile pages (shown to outsiders, must
// not leak app chrome), and the public landing + German legal pages (anonymous
// marketing surface — TopBar calls the auth-only getCompanyChrome() action).
// NOTE: "/" is NOT in this array — the matcher uses startsWith(r + "/"), so a
// bare "/" is inert; the root is handled by the explicit exact check below.
const BARE_ROUTES = ["/login", "/signup", "/c", "/impressum", "/datenschutz", "/agb", "/sella"];

/**
 * The frame every page sits inside: a full-height dark rail down the left, and
 * a content column (top bar + page) filling the rest. Composed in the root
 * layout, so all routes inherit it. The pink glass background lives on <body>.
 *
 * On auth routes it steps aside and renders the page alone (see BARE_ROUTES).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The explicit `pathname === "/"` is what makes the public landing render bare
  // (Pitfall 1 — the highest-probability miss). Without it the landing renders
  // inside the signed-in shell (IconRail + auth-only TopBar) for anonymous
  // visitors (T-09-03).
  const bare =
    pathname === "/" ||
    BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (bare) return <>{children}</>;

  return (
    <BasketProvider>
      <div className="flex h-full">
        <IconRail />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* TopBar renders the basket icon AND its anchored popover (BasketDrawer)
              together, so the popover's CSS position:absolute is relative to the
              icon itself - it no longer lives here as a separate fixed overlay. */}
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto p-3">{children}</main>
        </div>
      </div>
    </BasketProvider>
  );
}
