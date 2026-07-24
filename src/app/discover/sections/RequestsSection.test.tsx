/**
 * Render smoke test for <RequestsSection> (Lane B, DISC-12). One "Connection
 * requests" box holds two kinds with genuinely different accept paths (company +
 * person) shown as a single list — a square avatar is a company, a circle a person.
 * Accept/decline wiring (browser acceptItem/declineItem for company; personActions
 * for people) needs a browser — flagged as owed. Empty → an empty-state card (the
 * box lives in the duo, so it holds its column rather than vanishing).
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
  it('renders company + person requests in one list with Accept/Decline', () => {
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[companyReq]} personRequests={[personReq]} />,
    )
    expect(html).toContain('Connection requests') // section title
    expect(html).toContain('Green Leaf Labs') // company request
    expect(html).toContain('Sam Sender') // person request
    expect(html).toContain('Accept')
    expect(html).toContain('Decline')
  })

  it('shows an empty state (not nothing) when there are no requests', () => {
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[]} personRequests={[]} />,
    )
    expect(html).toContain('No pending requests')
  })
})
