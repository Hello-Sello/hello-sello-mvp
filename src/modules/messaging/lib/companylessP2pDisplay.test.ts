/**
 * RED unit contract for the company-less p2p display resolver (Lane B, PG-12).
 *
 * A Discover person↔person DM thread has relationship_id = NULL, so getConversations
 * cannot resolve its counterparty from a relationship pair — it must resolve from
 * the PERSON, and must NOT read "Unknown company". This is that pure logic.
 *
 * ⚠️  RED-FIRST: companylessP2pDisplay isn't exported yet → import fails. GREEN
 * when src/modules/messaging/lib/companylessP2pDisplay.ts lands.
 */
import { describe, it, expect } from 'vitest'
import { companylessP2pDisplay } from '@/modules/messaging/lib/companylessP2pDisplay'

describe('companylessP2pDisplay (PG-12)', () => {
  it('shows the counterparty company when it is visible, and marks it external', () => {
    const d = companylessP2pDisplay({
      personName: 'Jane Doe',
      personCompanyId: 'c-other',
      personCompanyName: 'Bloom Pharma',
      viewerCompanyId: 'c-mine',
    })
    expect(d.subtitle).toBe('Bloom Pharma')
    expect(d.companyName).toBe('Bloom Pharma')
    expect(d.companyId).toBe('c-other')
    expect(d.isExternal).toBe(true)
  })

  it('falls back to "Direct message" (never "Unknown company") when the company is not visible', () => {
    const d = companylessP2pDisplay({
      personName: 'Jane Doe',
      personCompanyId: 'c-other',
      personCompanyName: null, // company_select hides a non-company-connected company
      viewerCompanyId: 'c-mine',
    })
    expect(d.subtitle).toBe('Direct message')
    expect(d.companyName).toBe('Jane Doe') // fall back to the person's name, not "Unknown"
    expect(d.subtitle).not.toMatch(/unknown/i)
  })

  it('is not external when the counterparty is at the viewer\'s own company', () => {
    const d = companylessP2pDisplay({
      personName: 'Sam',
      personCompanyId: 'c-mine',
      personCompanyName: 'My Co',
      viewerCompanyId: 'c-mine',
    })
    expect(d.isExternal).toBe(false)
  })
})
