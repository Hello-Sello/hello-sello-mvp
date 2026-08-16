/**
 * RED unit contract for the discoverable-people row mapper (Lane B, DISC-8).
 *
 * getDiscoverablePeople is a thin read over list_discoverable_people (RLS + safe
 * fields + connection_state proven by pgTAP). The unit-testable logic is the pure
 * row mapper: per-bucket URL resolution, type_codes → labels via taxonomy, and
 * carrying connection_state.
 *
 * ⚠️  RED-FIRST: mapDiscoverPersonRow isn't exported from src/app/discover/people.ts yet.
 */
import { describe, it, expect } from 'vitest'
import { mapDiscoverPersonRow } from '@/app/discover/people'

const urlFor = (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`

const row = {
  person_id: 'p1',
  display_name: 'Jane Doe',
  title: 'Head of Sales',
  avatar_path: 'avatars/jane.png',
  public_handle: 'jane',
  company_id: 'c1',
  company_name: 'Bloom Pharma',
  company_logo_path: 'logos/bloom.png',
  company_country: 'DE',
  company_city: 'Berlin',
  type_codes: ['eu_gmp_cultivator', 'wholesaler'],
  connection_state: 'requested' as const,
}

describe('mapDiscoverPersonRow (DISC-8)', () => {
  it('resolves URLs, maps type_codes to labels, and carries connection_state', () => {
    const out = mapDiscoverPersonRow(row, urlFor)
    expect(out.personId).toBe('p1')
    expect(out.name).toBe('Jane Doe')
    expect(out.avatarUrl).toBe('https://cdn.test/avatars/avatars/jane.png')
    expect(out.companyLogoUrl).toBe('https://cdn.test/shop-media/logos/bloom.png')
    expect(out.categories).toEqual(['EU-GMP Cultivator', 'Wholesaler'])
    expect(out.companyCountryName).toBe('Germany')
    expect(out.connectionState).toBe('requested')
  })

  it('null avatar / logo paths resolve to null; empty type_codes → []', () => {
    const out = mapDiscoverPersonRow(
      { ...row, avatar_path: null, company_logo_path: null, type_codes: null },
      urlFor,
    )
    expect(out.avatarUrl).toBeNull()
    expect(out.companyLogoUrl).toBeNull()
    expect(out.categories).toEqual([])
  })
})
