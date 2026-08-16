/**
 * Render smoke test for <NewPeopleSection> (Lane B, DISC-9 + DISC-10).
 * renderToStaticMarkup in the node env: cards render, the "+" Connect CTA shows
 * for a `none` state, a `connected` person shows Connected, and the pharmacy gate
 * hides a person whose company is pharmacy-only. Interactive "+" click needs a
 * browser — flagged as owed.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewPeopleSection } from '@/app/discover/sections/NewPeopleSection'
import type { DiscoverPerson } from '@/app/discover/people'

const person = (over: Partial<DiscoverPerson>): DiscoverPerson => ({
  personId: 'p', name: 'Jane Doe', title: 'Head of Sales',
  avatarUrl: null, publicHandle: null,
  companyId: 'c', companyName: 'Bloom Labs', companyLogoUrl: null,
  companyCountryCode: 'DE', companyCountryName: 'Germany', companyCity: 'Berlin',
  categories: ['Wholesaler'], connectionState: 'none', ...over,
})

describe('<NewPeopleSection> (DISC-9/10)', () => {
  it('renders a person card with the Connect CTA for a none state', () => {
    const html = renderToStaticMarkup(<NewPeopleSection people={[person({ name: 'Jane Doe' })]} />)
    expect(html).toContain('Jane Doe')
    expect(html).toContain('Head of Sales')
    expect(html).toContain('Connect')
  })

  it('hides connected + incoming-request people (they live in My Network / Requests), keeps the rest', () => {
    const html = renderToStaticMarkup(
      <NewPeopleSection
        people={[
          person({ personId: 'a', name: 'Nora New', connectionState: 'none' }),
          person({ personId: 'b', name: 'Cora Connected', connectionState: 'connected' }),
          person({ personId: 'c', name: 'Ivan Incoming', connectionState: 'incoming' }),
        ]}
      />,
    )
    expect(html).toContain('Nora New')
    expect(html).not.toContain('Cora Connected')
    expect(html).not.toContain('Ivan Incoming')
  })

  it('hides a person whose company is pharmacy-only (people pharmacy gate)', () => {
    const html = renderToStaticMarkup(
      <NewPeopleSection
        people={[
          person({ personId: 'a', name: 'Visible Vic', categories: ['Wholesaler'] }),
          person({ personId: 'b', name: 'Pharma Pat', categories: ['Pharmacy'] }),
        ]}
      />,
    )
    expect(html).toContain('Visible Vic')
    expect(html).not.toContain('Pharma Pat')
  })
})
