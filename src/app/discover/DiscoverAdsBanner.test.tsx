/**
 * Unit contract for <DiscoverAdsBanner> (Lane B, DISC-4): the full-width
 * "leaderboard" at the top of Discover, carrying one sponsored creative.
 * Asserted via renderToStaticMarkup in the repo's node vitest env (no jsdom).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverAdsBanner } from '@/app/discover/DiscoverAdsBanner'

describe('<DiscoverAdsBanner> (DISC-4)', () => {
  it('labels the slot as sponsored', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).toContain('aria-label="Sponsored"')
    expect(html).toContain('>Sponsored<')
  })

  it('shows the creative, with alt text that says what the ad is', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).toMatch(/<img[^>]*alt="Superseed Grape Cookies[^"]*"/)
    expect(html).toContain('grape-cookies-banner.png')
    expect(html).not.toContain('Your ad could be here')
  })
})
