import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth";
import { LandingNav } from "./_landing/LandingNav";
import { Hero } from "./_landing/Hero";
import { TrustedBy } from "./_landing/TrustedBy";
import { SocialProof } from "./_landing/SocialProof";
import { ProductFlipCard } from "./_landing/ProductFlipCard";
import { ValueProps } from "./_landing/ValueProps";
import { HowItWorks } from "./_landing/HowItWorks";
import { B2BOnlyBand } from "./_landing/B2BOnlyBand";
import { FAQ } from "./_landing/FAQ";
import { FinalCTA } from "./_landing/FinalCTA";
import { Footer } from "./_landing/Footer";
import { SectionHeading } from "./_landing/SectionHeading";
import { Reveal } from "./_landing/Reveal";
import { CookieBanner } from "./_landing/CookieBanner";

// Server component (required for both `export const metadata` and `redirect()`).
// Do NOT mark this "use client" — that breaks the metadata export AND the D-01
// redirect. Interactivity lives in child "use client" components (LandingNav,
// Reveal).
export const metadata: Metadata = {
  title: "Hello Sello - B2B pharma trade, connected",
  description:
    "Hello Sello is the B2B marketplace for verified companies. Discover trusted partners, connect safely with no cross-company leaks, and turn conversations into documented deals.",
};

/**
 * Root route. The public front door (D-01): a logged-out visitor lands on the
 * marketing page; a signed-in visitor is redirected into the app. The session
 * check is a page-level read (getCurrentUser — JWT-revalidated), NOT proxy logic
 * (B7 lock — proxy stays thin, no DB lookups). Redirect target is /home, which
 * already handles every verification / no-company state safely.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  return (
    <div className="min-h-screen">
      <LandingNav />
      <main>
        <Hero />

        {/* §3 logo bar — illustrative partner logos (dummy medical companies)
            standing in until real partner logos exist (see TrustedBy). */}
        <section className="mx-auto max-w-6xl px-6 py-10">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Trusted by teams across pharma
            </p>
            <div className="mt-6">
              <TrustedBy />
            </div>
          </Reveal>
        </section>

        <ValueProps />
        <HowItWorks />

        {/* §6 product preview — a real product card (front/back flip). The
            listing is illustrative (see ProductFlipCard). */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <SectionHeading
            eyebrow="See it in action"
            title="A gated product, here's the inside"
            sub="You can't try it without verification, so here's a look at what's behind the gate."
          />
          <Reveal className="mt-12">
            <ProductFlipCard />
          </Reveal>
        </section>

        {/* §7 social proof — testimonials + metrics (illustrative / fictional
            stand-in until real proof exists; see SocialProof). */}
        <SocialProof />

        <B2BOnlyBand />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      {/* Last child — a "use client" island; page.tsx stays a server component. */}
      <CookieBanner />
    </div>
  );
}
