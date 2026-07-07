import { redirect } from "next/navigation";
import { requireVerified } from "@/shared/auth";
import { DealCardPanelHost } from "./DealCardPanelHost";
import { SellaPlaceholderBar } from "./SellaPlaceholderBar";

/**
 * Connect surface layout. After F2 there is only ONE global nav rail (IconRail),
 * and Connect's tabs (Chat / Connection Request / Relationship) live there as the
 * Connect accordion children - so this layout no longer renders a second nav
 * column. It is now just the Connect surface's auth gate + a full-width content
 * frame. The global shell (rail + slim top bar) comes from the root layout.
 *
 * Bouncer 1 — Connect surface gate (AUTH-01, D-01). An async Server Component so
 * the verification guard runs before rendering any Connect content. Redirect
 * logic mirrors discover/layout.tsx:
 *
 *   pending  → /home  (pending banner explains the wait)
 *   rejected → /onboarding  (rejection reason banner + resubmit, 04-03)
 *   revoked  → /home  (suspended banner, 04-03)
 *   null     → /onboarding  (no company yet — D-03 no-company bounce)
 */
export default async function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { blocked, reason } = await requireVerified();

  if (blocked) {
    if (reason === "pending") redirect("/home");
    if (reason === "rejected") redirect("/onboarding");
    if (reason === "revoked") redirect("/home");
    // reason === null: no company yet — D-03 no-company bounce
    redirect("/onboarding");
  }

  return (
    <section className="flex h-full min-w-0 flex-1 gap-3">
      {/* the surface content (chat, relationship, inbox…). It shrinks to the left
          half when the deal card opens beside it - the chat "minimizes", the card
          takes the other half. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {/* the deal card panel host (D-31/D-32, revised) - now an IN-FLOW 50/50
          panel, not a blurred overlay. Any page's deal control fires
          `hs:open-deal-card`; this host renders the flip DealCard as a flex
          sibling here (chat left, card right, no blur), and its X closes it so
          the content expands back. Mounted once at the Connect root; the acyclic
          seam holds (no module back-imports another). */}
      <DealCardPanelHost />
      {/* the Sella placeholder bar (D-10) - the fixed right-edge ping bubble; the
          real Sella opens from it in Phase 8. position:fixed keeps it out of the
          split's flex flow. */}
      <SellaPlaceholderBar />
    </section>
  );
}
