/**
 * Unit contract for <DiscoverAdsBanner> (Lane B, DISC-4). v0 is a full-width
 * "leaderboard" placeholder: it holds the banner's shape (glass panel, "Sponsored"
 * tag) but carries no ad content — one honest empty slot until real ad serving
 * exists. Asserted via renderToStaticMarkup in the repo's node vitest env (no jsdom).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverAdsBanner } from '@/app/discover/DiscoverAdsBanner'

describe('<DiscoverAdsBanner> (DISC-4)', () => {
  it('renders a labelled sponsored banner', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).not.toBe('')
    expect(html).toContain('Sponsored')
  })

  it('shows an honest empty slot (no fake ad content)', () => {
    const html = renderToStaticMarkup(<DiscoverAdsBanner />)
    expect(html).toContain('Your ad could be here')
  })
})
