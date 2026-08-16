/**
 * Render smoke test for <MyNetworkSection> (Lane B, DISC-14). Two parts:
 * connected companies + connected people (each person has a Message link to their
 * company-less DM via ?thread=). Empty → an empty-state card (the box lives in the
 * duo, so it holds its column). Interactive expand / navigation needs a browser.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MyNetworkSection } from '@/app/discover/sections/MyNetworkSection'
import type { ConnectedCompany } from '@/modules/messaging/types'
import type { DiscoverPersonConnection } from '@/app/discover/personNetwork'

const company: ConnectedCompany = {
  companyId: 'co1', relationshipId: 'r1', name: 'Green Leaf Labs', city: 'Berlin',
  initials: 'GL', contactsCount: 2, connectedAt: '2026-07-01T00:00:00Z', openDealCount: 1, people: [],
}
const person: DiscoverPersonConnection = {
  personId: 'p1', name: 'Jane Doe', title: 'Buyer', avatarUrl: null, publicHandle: null,
  companyId: 'c2', companyName: 'Acme', companyLogoUrl: null,
  companyCountryCode: 'DE', companyCountryName: 'Germany', companyCity: 'Berlin', threadId: 'th1',
}

describe('<MyNetworkSection> (DISC-14)', () => {
  it('renders connected companies and people with a Message link', () => {
    const html = renderToStaticMarkup(<MyNetworkSection companies={[company]} people={[person]} />)
    expect(html).toContain('Green Leaf Labs')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('Message')
    expect(html).toContain('/connect/chat?thread=th1')
  })

  it('shows an empty state (not nothing) when the network is empty', () => {
    const html = renderToStaticMarkup(<MyNetworkSection companies={[]} people={[]} />)
    expect(html).toContain('No connections yet')
  })
})
