/**
 * RED unit test for <VerifiedBadge> (Phase 10, Plan 01 — Wave-0 RED contract, ACCT-01).
 *
 * Asserts the D-01/D-02 render rule against the not-yet-built component:
 *   D-01: one shared, status-driven badge (reads `status`, not a boolean) — forward-shaped
 *         so the Flowz unverified variant is a later `else`, not a rewrite.
 *   D-02: render ONLY on `status === 'verified'`; return `null` otherwise (absence = no claim).
 *
 * This test FAILS now — `src/shared/ui/VerifiedBadge.tsx` does not exist yet (it lands in
 * 10-02). The import below throws module-not-found, which is the intended RED state.
 *
 * Render path: `react-dom/server` `renderToStaticMarkup` — keeps this in the repo's
 * existing pure-`node` vitest env (no jsdom / @testing-library / new packages this phase,
 * per threat register T-10-SC). When 10-02 ships the component, this turns GREEN unchanged.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerifiedBadge } from '@/shared/ui/VerifiedBadge'

describe('<VerifiedBadge> (D-01/D-02 render rule)', () => {
  it('renders a "Verified" pill for status="verified" variant="pill"', () => {
    const html = renderToStaticMarkup(<VerifiedBadge status="verified" variant="pill" />)
    expect(html).toContain('Verified')
  })

  it('renders nothing for a non-verified status (returns null)', () => {
    const html = renderToStaticMarkup(<VerifiedBadge status="pending" variant="pill" />)
    expect(html).toBe('')
  })

  it('renders a non-empty element for status="verified" variant="tick" (corner tick)', () => {
    const html = renderToStaticMarkup(<VerifiedBadge status="verified" variant="tick" />)
    expect(html).not.toBe('')
  })
})
