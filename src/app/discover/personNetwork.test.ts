/**
 * RED unit contract for the "My Network: people" row mapper (Lane B, PG-10).
 *
 * getMyPersonConnections is a thin read over the list_my_person_connections RPC
 * (RLS + safe-fields proven by pgTAP). The unit-testable logic is the pure row
 * mapper: URL resolution per bucket (avatar → avatars, logo → shop-media) and
 * null-handling. The resolver is injected so no Supabase client is needed here.
 *
 * ⚠️  RED-FIRST (PG-10): mapPersonConnectionRow isn't exported from
 * src/app/discover/personNetwork.ts yet → the import fails. GREEN when it lands.
 */
import { describe, it, expect } from 'vitest'
import { mapPersonConnectionRow } from '@/app/discover/personNetwork'

const urlFor = (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`

const fullRow = {
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
}

describe('mapPersonConnectionRow (PG-10)', () => {
  it('resolves avatar + company logo URLs via the injected resolver', () => {
    const out = mapPersonConnectionRow(fullRow, urlFor)
    expect(out.personId).toBe('p1')
    expect(out.name).toBe('Jane Doe')
    expect(out.avatarUrl).toBe('https://cdn.test/avatars/avatars/jane.png')
    expect(out.companyLogoUrl).toBe('https://cdn.test/shop-media/logos/bloom.png')
    expect(out.companyCountryName).toBe('Germany')
  })

  it('null avatar / company paths resolve to null, not a broken URL', () => {
    const out = mapPersonConnectionRow(
      { ...fullRow, avatar_path: null, company_id: null, company_logo_path: null, company_country: null },
      urlFor,
    )
    expect(out.avatarUrl).toBeNull()
    expect(out.companyLogoUrl).toBeNull()
    expect(out.companyId).toBeNull()
    expect(out.companyCountryName).toBeNull()
  })
})
