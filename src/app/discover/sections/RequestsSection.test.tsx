/**
 * Render smoke test for <RequestsSection> (Lane B, DISC-12). One section, two
 * labelled groups (Company requests / People), each with Accept/Decline. Accept/
 * decline wiring (browser acceptItem/declineItem for company; personActions for
 * people) needs a browser — flagged as owed. Empty → renders nothing.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RequestsSection } from '@/app/discover/sections/RequestsSection'
import type { DiscoverCompanyRequest } from '@/app/discover/companyRequests'
import type { DiscoverPersonRequest } from '@/app/discover/incomingPersonRequests'

const companyReq: DiscoverCompanyRequest = {
  itemId: 'c1', note: 'Let us connect', createdAt: '2026-07-24T00:00:00Z',
  senderCompanyId: 'co1', senderCompanyName: 'Green Leaf Labs', senderInitials: 'GL',
}
const personReq: DiscoverPersonRequest = {
  itemId: 'p1', note: 'hi', createdAt: '2026-07-24T00:00:00Z',
  senderPersonId: 's1', senderName: 'Sam Sender', senderTitle: 'Buyer',
  senderAvatarUrl: null, senderCompanyId: 'co2', senderCompanyName: 'Acme', senderCompanyLogoUrl: null,
}

describe('<RequestsSection> (DISC-12)', () => {
  it('renders both labelled groups with their items + Accept/Decline', () => {
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[companyReq]} personRequests={[personReq]} />,
    )
    expect(html).toContain('Company requests')
    expect(html).toContain('People')
    expect(html).toContain('Green Leaf Labs')
    expect(html).toContain('Sam Sender')
    expect(html).toContain('Accept')
    expect(html).toContain('Decline')
  })

  it('renders nothing when there are no requests', () => {
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[]} personRequests={[]} />,
    )
    expect(html).toBe('')
  })
})
