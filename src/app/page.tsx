import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth";
import { LandingNav } from "./_landing/LandingNav";
import { Hero } from "./_landing/Hero";
import { PlaceholderSlot } from "./_landing/PlaceholderSlot";
import { ValueProps } from "./_landing/ValueProps";
import { HowItWorks } from "./_landing/HowItWorks";
import { B2BOnlyBand } from "./_landing/B2BOnlyBand";
import { FAQ } from "./_landing/FAQ";
import { FinalCTA } from "./_landing/FinalCTA";
import { Footer } from "./_landing/Footer";

// Server component (required for both `export const metadata` and `redirect()`).
// Do NOT mark this "use client" — that breaks the metadata export AND the D-01
// redirect. Interactivity lives in child "use client" components (LandingNav).
export const metadata: Metadata = {
  title: "Hello Sello — B2B pharma trade, connected",
  description:
    "Hello Sello is the B2B marketplace for verified companies — discover trusted partners, connect safely with no cross-company leaks, and turn conversations into documented deals.",
};

/**
 * Root route. The public front door (D-01): a logged-out visitor lands on the
 * marketing page; a signed-in visitor is redirected into the app. The session
 * check is a page-level read (getCurrentUser — JWT-revalidated), NOT proxy
 * logic (B7 lock — proxy stays thin, no DB lookups). Redirect target is /home,
 * which already handles every verification / no-company state safely.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  return (
    <div className="min-h-screen">
      <LandingNav />
      <main>
        <Hero />

        {/* §3 logo bar — D-06 placeholder, no fabricated logos. */}
        <section className="mx-auto max-w-6xl px-6 py-10">
          <PlaceholderSlot
            label="Customer logos"
            hint="Trusted-by logo bar — added once real partner logos exist."
            aspect="wide"
          />
        </section>

        <ValueProps />
        <HowItWorks />

        {/* §6 product preview / demo — D-06 placeholder. */}
        <section className="mx-auto max-w-6xl px-6 py-10">
          <PlaceholderSlot
            label="Product demo"
            hint="Screenshot or short walkthrough of the app in action."
            aspect="video"
          />
        </section>

        {/* §7 social proof — testimonials + metrics, D-06 placeholders + the
            verified-companies trust angle. No fabricated testimonials/metrics. */}
        <section className="mx-auto grid max-w-6xl gap-5 px-6 py-10 sm:grid-cols-2">
          <PlaceholderSlot
            label="Testimonials"
            hint="Customer quotes — added once real testimonials exist."
            aspect="wide"
          />
          <PlaceholderSlot
            label="Metrics"
            hint="Verified companies, deals closed — real numbers only, no fabrication."
            aspect="wide"
          />
        </section>

        <B2BOnlyBand />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
