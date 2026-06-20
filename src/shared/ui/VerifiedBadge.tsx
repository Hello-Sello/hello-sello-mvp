import { Check, CheckCircle2 } from 'lucide-react'

/**
 * Shared verified badge (ACCT-01). The signed-off visual contract is
 * `prototypes/verified-badge-prototype/index.html` — form E (frosted-glass pill,
 * for roomy surfaces) and form G (logo-corner tick, for dense rows).
 *
 * D-01 — status-driven, forward-shaped. Reads `status` (not a boolean) so adding
 *        the Flowz unverified/unclaimed variant later is a new `else`, not a rewrite.
 * D-02 — render rule: ONLY on `status === 'verified'`; return null otherwise.
 *        Absence of the badge = no claim made (the unverified label is the deferred
 *        Flowz-era variant, not built now).
 *
 * The 'tick' variant absolutely-positions itself in a logo corner, so the CALLER's
 * logo container MUST be `relative` (e.g. Discover row Logo, Discover detail logo).
 */
export function VerifiedBadge({
  status,
  variant = 'pill',
}: {
  status: string
  variant?: 'pill' | 'tick'
}) {
  if (status !== 'verified') return null

  if (variant === 'tick') {
    // Form G — green tick pinned bottom-right of a `relative` logo box.
    return (
      <span
        aria-label="Verified"
        title="Verified"
        className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-success shadow-[0_2px_6px_-1px_rgba(52,178,51,0.6)]"
      >
        <Check size={11} strokeWidth={3.2} className="text-white" />
      </span>
    )
  }

  // Form E — frosted-glass "Verified" pill for surfaces with room.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/35 bg-white/60 px-3 py-1 text-xs font-semibold text-success shadow-[0_6px_18px_-8px_rgba(52,178,51,0.35)] backdrop-blur-sm">
      <CheckCircle2 size={13} strokeWidth={2.4} /> Verified
    </span>
  )
}
