/**
 * RED unit contract for the incoming COMPANY-request row mapper (Lane B, DISC-11)
 * and, per T03 (ADR 0009 D3/D8/I-J4), the Discover Requests filter constant.
 *
 * getIncomingConnectionRequests is a thin SERVER read over pending_inbox_item
 * (RLS-scoped to the receiver company; the incoming/pending/connect filter is in
 * the query). The unit-testable logic is the pure row mapper: sender initials +
 * the Supabase embed (object|array) + a null-sender fallback + (T03) the `type`
 * passthrough. COMPANY_REQUEST_TYPES is the filter constant itself — asserted
 * directly so a builder narrowing `.in("type", ...)` back down can't stay green.
 *
 * ⚠️  RED-FIRST: mapCompanyRequestRow isn't exported from
 * src/app/discover/companyRequests.ts yet. COMPANY_REQUEST_TYPES doesn't exist
 * yet either, and `type` isn't yet a field on Row/DiscoverCompanyRequest — every
 * literal below that sets `type` will fail to compile until T03 widens both.
 */
import { describe, it, expect } from 'vitest'
import { mapCompanyRequestRow, COMPANY_REQUEST_TYPES } from '@/app/discover/companyRequests'

describe('mapCompanyRequestRow (DISC-11)', () => {
  it('maps a row with an object embed + computes initials', () => {
    const out = mapCompanyRequestRow({
      id: 'i1', note: 'hi', created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c1', sender: { name: 'Green Leaf Labs' }, type: 'connect',
    })
    expect(out.itemId).toBe('i1')
    expect(out.senderCompanyName).toBe('Green Leaf Labs')
    expect(out.senderInitials).toBe('GL')
    expect(out.type).toBe('connect')
  })

  it('handles the Supabase array-embed shape', () => {
    const out = mapCompanyRequestRow({
      id: 'i2', note: null, created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c2', sender: [{ name: 'Acme' }], type: 'connect_message',
    })
    expect(out.senderCompanyName).toBe('Acme')
    expect(out.senderInitials).toBe('A')
    expect(out.type).toBe('connect_message')
  })

  it('falls back to "Unknown company" when the sender embed is null', () => {
    const out = mapCompanyRequestRow({
      id: 'i3', note: null, created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c3', sender: null, type: 'connect',
    })
    expect(out.senderCompanyName).toBe('Unknown company')
  })

  it('maps a pricelist_request row, passing its type through unchanged (T03)', () => {
    const out = mapCompanyRequestRow({
      id: 'i4', note: 'Pricing for SKU-1', created_at: '2026-07-24T00:00:00Z',
      sender_company_id: 'c4', sender: { name: 'Pricely Co' }, type: 'pricelist_request',
    })
    expect(out.itemId).toBe('i4')
    expect(out.type).toBe('pricelist_request')
  })
})

describe('COMPANY_REQUEST_TYPES (T03, D3/D8/I-J4)', () => {
  it('contains pricelist_request alongside connect and connect_message', () => {
    expect(COMPANY_REQUEST_TYPES).toContain('connect')
    expect(COMPANY_REQUEST_TYPES).toContain('connect_message')
    expect(COMPANY_REQUEST_TYPES).toContain('pricelist_request')
  })

  it('excludes deal_card (I-J4: a different list, ADR I-J2) and connect_person (I-J4: a different graph/RPC)', () => {
    expect(COMPANY_REQUEST_TYPES).not.toContain('deal_card')
    expect(COMPANY_REQUEST_TYPES).not.toContain('connect_person')
  })
})
