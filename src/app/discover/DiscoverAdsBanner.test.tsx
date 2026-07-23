/**
 * RED unit contract for <DiscoverAdsBanner> (Lane B, DISC-4).
 *
 * The ads banner is a static, horizontally-scrollable placeholder strip (no data,
 * no ad serving yet). Asserted via renderToStaticMarkup in the repo's node vitest
 * env (same approach as VerifiedBadge.test.tsx — no jsdom).
 *
 * ⚠️  RED-FIRST: the component doesn't exist yet → import fails.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverAdsBanner } from '@/app/discover/DiscoverAdsBanner'

describe('<DiscoverAdsBanner> (DISC-4)', () => {
  it('renders a horizontally-scrollable strip', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).not.toBe('')
    expect(html).toContain('overflow-x-auto')
  })

  it('renders empty placeholder ad slots (no data)', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).toContain('data-ad-slot')
  })
})
