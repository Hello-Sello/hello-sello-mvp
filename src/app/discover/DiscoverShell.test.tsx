/**
 * Render smoke test for <DiscoverShell> (Lane B, DISC-6). Confirms the shell
 * stacks the ads banner + the companies section (with its hero) in one render.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverShell } from '@/app/discover/DiscoverShell'
import type { DiscoverCompany } from '@/app/discover/companies'

const co = (over: Partial<DiscoverCompany>): DiscoverCompany => ({
  id: 'x', name: 'X', countryCode: 'DE', countryName: 'Germany', city: 'Berlin',
  categories: ['Wholesaler'], logoUrl: null, connectionState: 'none', ...over,
})

describe('<DiscoverShell> (DISC-6)', () => {
  it('renders the ads banner + the companies section together', () => {
    const html = renderToStaticMarkup(
      <DiscoverShell companies={[co({ id: 'a', name: 'Acme Cultivation' })]} />,
    )
    expect(html).toContain('Sponsored') // ads banner region label
    expect(html).toContain('Find a company to connect with') // companies hero
    expect(html).toContain('Acme Cultivation') // a company row
  })
})
