import { redirect } from 'next/navigation'
import { requireVerified } from '@/shared/auth'

/**
 * Bouncer 1 — Discover surface gate (AUTH-01, D-01).
 *
 * Checks the caller's company verification status BEFORE rendering any Discover
 * content. Redirects by reason so the user lands on a safe, explanatory page:
 *
 *   pending  → /home  (the pending banner explains the wait)
 *   rejected → /onboarding  (pre-filled stepper + rejection reason banner, 04-03)
 *   revoked  → /home  (suspended banner, 04-03)
 *   null     → /onboarding  (no company yet — the D-03 no-company bounce, mirrors home/page.tsx:18)
 *
 * D-03 page-coverage note: Present and Account are intentionally NOT gated here.
 *   · /present — shows the seller's own internal content; an unverified seller
 *     seeing their own empty catalogue is not a cross-company data leak. Gated
 *     external actions INSIDE Present (if any) are protected at the action layer
 *     (bouncer 2), not the page layer.
 *   · /account — reachable pre-company by design (user must manage their account
 *     before/without a company).
 *
 * Expired/absent sessions are already redirected to /login by the proxy
 * (src/shared/db/proxy.ts getClaims()), so the session is always authenticated
 * by the time this layout runs (AUTH-04, D-11).
 *
 * Do NOT add DB lookups to proxy.ts (B7 lock).
 */
export default async function DiscoverLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { blocked, reason } = await requireVerified()

  if (blocked) {
    if (reason === 'pending') redirect('/home')
    if (reason === 'rejected') redirect('/onboarding')
    if (reason === 'revoked') redirect('/home')
    // reason === null: no company yet — D-03 no-company bounce
    redirect('/onboarding')
  }

  return <>{children}</>
}
