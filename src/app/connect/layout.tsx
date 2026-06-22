import { redirect } from "next/navigation";
import { requireVerified } from "@/shared/auth";
import { DealRoomOverlayHost } from "./DealRoomOverlayHost";

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
    <section className="flex h-full min-w-0 flex-1 flex-col">
      {children}
      {/* the Deal Room overlay host (D-01) - mounted once at the Connect root so
          the strip's "Deal Room" button can open the Room over any Connect page;
          it is the acyclic composition point for deals' container + messaging's
          chat (it listens for the strip's window event and mounts the overlay). */}
      <DealRoomOverlayHost />
    </section>
  );
}
