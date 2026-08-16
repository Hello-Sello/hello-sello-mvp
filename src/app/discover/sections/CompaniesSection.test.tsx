/**
 * Render smoke test for <CompaniesSection> (Lane B, DISC-5 behavior-preserving
 * extraction). renderToStaticMarkup exercises the initial (unfiltered) render in
 * the repo's node vitest env. Asserts rows render, the Connect CTA shows for a
 * `none` state, and the DISC-3 pharmacy gate hides a pharmacy-only company by
 * default. Interactive filtering needs a browser — flagged as owed in the plan.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CompaniesSection } from '@/app/discover/sections/CompaniesSection'
import type { DiscoverCompany } from '@/app/discover/companies'

const co = (over: Partial<DiscoverCompany>): DiscoverCompany => ({
  id: 'x', name: 'X', countryCode: 'DE', countryName: 'Germany', city: 'Berlin',
  categories: ['Wholesaler'], logoUrl: null, connectionState: 'none', ...over,
})

describe('<CompaniesSection> render (DISC-5)', () => {
  it('renders a listed company row with the Connect CTA', () => {
    const html = renderToStaticMarkup(
      <CompaniesSection companies={[co({ id: 'a', name: 'Acme Cultivation' })]} />,
    )
    expect(html).toContain('Acme Cultivation')
    expect(html).toContain('Connect')
  })

  it('hides a pharmacy-only company by default (DISC-3 gate preserved)', () => {
    const html = renderToStaticMarkup(
      <CompaniesSection
        companies={[
          co({ id: 'a', name: 'Acme Cultivation', categories: ['Wholesaler'] }),
          co({ id: 'b', name: 'Bloom Pharmacy', categories: ['Pharmacy'] }),
        ]}
      />,
    )
    expect(html).toContain('Acme Cultivation')
    expect(html).not.toContain('Bloom Pharmacy')
  })
})
