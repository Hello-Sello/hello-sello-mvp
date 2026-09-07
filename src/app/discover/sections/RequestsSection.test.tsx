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
  type: 'connect_message',
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
    expect(html).toContain('Requests') // section title (D9)
    expect(html).toContain('Green Leaf Labs') // company request
    expect(html).toContain('Sam Sender') // person request
    expect(html).toContain('Accept')
    expect(html).toContain('Decline')
    expect(html).toContain('Message') // connect_message fixture's badge label (D4/T04)
  })

  it('shows an empty state (not nothing) when there are no requests', () => {
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[]} personRequests={[]} />,
    )
    expect(html).toContain('No pending requests')
  })

  it('badges a pricelist_request row "Pricelist request" and a person row "Person" (D10/I-M16)', () => {
    // note is pinned so it cannot itself contain any badge label string — PLAN-T04
    // N4: buildPricingRequestNote emits `Pricing request for "X".`
    // (pricingRequest.ts:42-46), which does not collide with "Pricelist request".
    const pricelistReq: DiscoverCompanyRequest = {
      itemId: 'c2', note: 'Pricing request for "CBD Blossom 10g".', createdAt: '2026-07-24T00:00:00Z',
      senderCompanyId: 'co3', senderCompanyName: 'Acme Cultivation', senderInitials: 'AC',
      type: 'pricelist_request',
    }
    const html = renderToStaticMarkup(
      <RequestsSection companyRequests={[companyReq, pricelistReq]} personRequests={[personReq]} />,
    )
    expect(html).toContain('Pricelist request') // I-M16's exact literal
    expect(html).toContain('Person') // personReq row's badge (D10)
  })
})
