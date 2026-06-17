import { redirect } from "next/navigation";
import { ConnectSubNav } from "@/modules/connect";
import { requireVerified } from "@/shared/auth";

/**
 * Connect surface layout: the sub-nav (panel 2) beside the active tab's
 * content. The global shell (rail + top bar) comes from the root layout; this
 * only adds Connect's internal two-column frame.
 *
 * Bouncer 1 — Connect surface gate (AUTH-01, D-01). Converted from a sync
 * Server Component to an async one so the verification guard can run before
 * rendering any Connect content. Redirect logic mirrors discover/layout.tsx:
 *
 *   pending  → /home  (pending banner explains the wait)
 *   rejected → /onboarding  (rejection reason banner + resubmit, 04-03)
 *   revoked  → /home  (suspended banner, 04-03)
 *   null     → /onboarding  (no company yet — D-03 no-company bounce)
 *
 * The ConnectSubNav and two-column frame are preserved unchanged.
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
    <div className="flex h-full gap-3">
      <ConnectSubNav />
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
