import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth";
import { Ticker } from "./_landing/Ticker";
import { LandingNav } from "./_landing/LandingNav";
import { Hero } from "./_landing/Hero";
import { StepsFlow } from "./_landing/StepsFlow";
import { LandingFooterBar } from "./_landing/LandingFooterBar";
import { CookieBanner } from "./_landing/CookieBanner";

// The landing's display face. Loaded here (not in layout.tsx) so the app
// shell never pays for it; exposed as --font-display, used via `.lp-display`.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-display",
  display: "swap",
});

// Server component (required for both `export const metadata` and `redirect()`).
// Do NOT mark this "use client" — that breaks the metadata export AND the D-01
// redirect. Interactivity lives in child "use client" components (LandingNav,
// CookieBanner).
export const metadata: Metadata = {
  title: "Hello Sello - Safer bigger deals",
  description:
    "Close hundreds of B2B deals in one secured chat. Built for medical cannabis suppliers, growers, pharmacies and wholesalers: private chats and confidential deals with your entire network, GDPR compliant and hosted in Germany.",
};

/**
 * Root route. The public front door (D-01): a logged-out visitor lands on the
 * marketing page; a signed-in visitor is redirected into the app. The session
 * check is a page-level read (getCurrentUser — JWT-revalidated), NOT proxy logic
 * (B7 lock — proxy stays thin, no DB lookups). Redirect target is /home, which
 * already handles every verification / no-company state safely.
 *
 * ONE SCREEN (2026-09-13 redesign): on desktop the whole page is a single
 * viewport - ticker, nav, hero copy (left) + the deal-room window (right),
 * one-line legal footer - and does not scroll. The e2e case proves the fit
 * with toBeInViewport at 1366x768 and 1440x900; `lg:h-dvh` + `overflow-hidden`
 * then guarantee no scrollbar. Below `lg` the columns stack and the page
 * scrolls normally (a phone cannot hold this in one screen).
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  return (
    <div
      className={`${display.variable} lp-ground relative isolate flex min-h-dvh flex-col overflow-hidden lg:h-dvh`}
    >
      <Ticker />
      <LandingNav />
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[minmax(0,17fr)_minmax(0,25fr)] lg:gap-14 lg:px-10 lg:py-4">
        <Hero />
        <StepsFlow />
      </main>
      <LandingFooterBar />
      {/* Last child — a "use client" island; page.tsx stays a server component. */}
      <CookieBanner />
    </div>
  );
}
