/**
 * RED unit contract for the incoming person-requests row mapper (Lane B, PG-11).
 *
 * getIncomingPersonRequests is a thin read over list_incoming_person_requests
 * (RLS/filtering + safe fields proven by pgTAP). The unit-testable logic is the
 * pure row mapper: per-bucket URL resolution + null-handling, resolver injected.
 *
 * ⚠️  RED-FIRST (PG-11): mapIncomingPersonRequestRow isn't exported yet → import
 * fails. GREEN when src/app/discover/incomingPersonRequests.ts lands.
 */
import { describe, it, expect } from 'vitest'
import { mapIncomingPersonRequestRow } from '@/app/discover/incomingPersonRequests'

const urlFor = (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`

const row = {
  item_id: 'i1',
  note: 'hi',
  created_at: '2026-07-24T00:00:00Z',
  sender_person_id: 's1',
  sender_display_name: 'Sam Sender',
  sender_title: 'Buyer',
  sender_avatar_path: 'avatars/sam.png',
  sender_company_id: 'c1',
  sender_company_name: 'Acme Ltd',
  sender_company_logo_path: 'logos/acme.png',
}

describe('mapIncomingPersonRequestRow (PG-11)', () => {
  it('resolves sender avatar + company logo URLs via the injected resolver', () => {
    const out = mapIncomingPersonRequestRow(row, urlFor)
    expect(out.itemId).toBe('i1')
    expect(out.senderName).toBe('Sam Sender')
    expect(out.senderAvatarUrl).toBe('https://cdn.test/avatars/avatars/sam.png')
    expect(out.senderCompanyLogoUrl).toBe('https://cdn.test/shop-media/logos/acme.png')
  })

  it('null avatar / company logo paths resolve to null', () => {
    const out = mapIncomingPersonRequestRow(
      { ...row, sender_avatar_path: null, sender_company_logo_path: null },
      urlFor,
    )
    expect(out.senderAvatarUrl).toBeNull()
    expect(out.senderCompanyLogoUrl).toBeNull()
  })
})
