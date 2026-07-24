/**
 * Render smoke test for <DiscoverShell> (Lane B, DISC-6). Confirms the Variant D
 * layout renders in one pass: the ads banner, the Requests | My Network duo, and
 * the Companies directory.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverShell } from '@/app/discover/DiscoverShell'
import type { DiscoverCompany } from '@/app/discover/companies'

// DiscoverShell calls useRouter() (for the live-refresh hook); the bare
// renderToStaticMarkup env has no app-router context, so stub it.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

const co = (over: Partial<DiscoverCompany>): DiscoverCompany => ({
  id: 'x', name: 'X', countryCode: 'DE', countryName: 'Germany', city: 'Berlin',
  categories: ['Wholesaler'], logoUrl: null, connectionState: 'none', ...over,
})

describe('<DiscoverShell> (DISC-6)', () => {
  it('renders the ads banner, the Requests | My Network duo, and the companies directory', () => {
    const html = renderToStaticMarkup(
      <DiscoverShell companies={[co({ id: 'a', name: 'Acme Cultivation' })]} />,
    )
    expect(html).toContain('Sponsored') // ads banner region label
    expect(html).toContain('Connection requests') // duo — left box
    expect(html).toContain('My network') // duo — right box
    expect(html).toContain('Companies') // directory section header
    expect(html).toContain('Acme Cultivation') // a company row
  })
})
