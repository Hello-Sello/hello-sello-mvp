/**
 * RED unit contract for the incoming COMPANY-request row mapper (Lane B, DISC-11).
 *
 * getIncomingConnectionRequests is a thin SERVER read over pending_inbox_item
 * (RLS-scoped to the receiver company; the incoming/pending/connect filter is in
 * the query). The unit-testable logic is the pure row mapper: sender initials +
 * the Supabase embed (object|array) + a null-sender fallback.
 *
 * ⚠️  RED-FIRST: mapCompanyRequestRow isn't exported from
 * src/app/discover/companyRequests.ts yet.
 */
import { describe, it, expect } from 'vitest'
import { mapCompanyRequestRow } from '@/app/discover/companyRequests'

describe('mapCompanyRequestRow (DISC-11)', () => {
  it('maps a row with an object embed + computes initials', () => {
    const out = mapCompanyRequestRow({
      id: 'i1', note: 'hi', created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c1', sender: { name: 'Green Leaf Labs' },
    })
    expect(out.itemId).toBe('i1')
    expect(out.senderCompanyName).toBe('Green Leaf Labs')
    expect(out.senderInitials).toBe('GL')
  })

  it('handles the Supabase array-embed shape', () => {
    const out = mapCompanyRequestRow({
      id: 'i2', note: null, created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c2', sender: [{ name: 'Acme' }],
    })
    expect(out.senderCompanyName).toBe('Acme')
    expect(out.senderInitials).toBe('A')
  })

  it('falls back to "Unknown company" when the sender embed is null', () => {
    const out = mapCompanyRequestRow({
      id: 'i3', note: null, created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c3', sender: null,
    })
    expect(out.senderCompanyName).toBe('Unknown company')
  })
})
