/**
 * Pure-function tests for `requestTypeBadge` (T04, ADR 0009 D4/D10, PLAN-T04 File
 * 3). No rendering — this is a lookup, not a component. RED until `requestTypeMeta.ts`
 * exists (builder's next step, not this file's).
 */
import { describe, it, expect } from 'vitest'
import { requestTypeBadge, type DiscoverRequestKind } from './requestTypeMeta'
import * as requestTypeMetaModule from './requestTypeMeta'

const ALL_KINDS: DiscoverRequestKind[] = [
  'connect',
  'connect_message',
  'pricelist_request',
  'person',
]

describe('requestTypeBadge (T04)', () => {
  it.each(ALL_KINDS)('resolves %s to a badge with a non-empty label and a defined icon', (kind) => {
    const badge = requestTypeBadge(kind)
    expect(badge).toBeDefined()
    expect(typeof badge.label).toBe('string')
    expect(badge.label.length).toBeGreaterThan(0)
    expect(badge.icon).toBeDefined()
  })

  it('labels pricelist_request with the exact literal "Pricelist request" (I-M16)', () => {
    expect(requestTypeBadge('pricelist_request').label).toBe('Pricelist request')
  })

  it('never returns undefined for a kind outside the union at runtime (I-M10, mirrors the connect_person crash)', () => {
    // `tsc` cannot see this: the value reaching the lookup at runtime comes from
    // a DB row, and a cast is the only way to simulate a union that has grown a
    // member the map hasn't. Confirmed to compile clean under this repo's own
    // `tsc --strict` (PLAN-T04 revision note) — a direct literal-to-disjoint-
    // literal cast within the same base type (`string`).
    const badge = requestTypeBadge('connect_person' as DiscoverRequestKind)
    expect(badge).toBeDefined()
    expect(typeof badge.label).toBe('string')
    expect(badge.label.length).toBeGreaterThan(0)
  })

  it('exports only requestTypeBadge — no filter-derivable key list (I-M11, N2)', () => {
    expect(Object.keys(requestTypeMetaModule)).toEqual(['requestTypeBadge'])
  })
})
