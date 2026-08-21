/**
 * RED unit contract for the per-product pricing-request note + metadata
 * builders (0022, T04, HEL-58 — PLAN-T04.md rev 4, D3/D7).
 *
 * These are the two pure pieces `requestProductPricing` (src/app/discover/
 * actions.ts) composes: the seller-visible `note` ('Pricing request for
 * "<product name>".', clamped by the SAME 280-char server-side cap
 * `createPairInboxItem` already applies at actions.ts:53-55 — so a name long
 * enough to blow the cap must never rely on the caller to trim it), and the
 * `metadata` object whose `product_id` key is the dup-guard's per-product
 * key (D4: `.filter("metadata->>product_id", "eq", productId)`).
 *
 * ⚠️  RED-FIRST: src/app/discover/pricingRequest.ts doesn't exist yet — this
 * import fails until T04's builder writes it (D7: a new module, not folded
 * into companies.ts, which is the Discover READ module).
 */
import { describe, it, expect } from 'vitest'
import {
  buildPricingRequestNote,
  buildPricingRequestMetadata,
  PRODUCT_ID_KEY,
} from '@/app/discover/pricingRequest'

describe('buildPricingRequestNote (HEL-58 D3)', () => {
  it('names the product in the generated note', () => {
    const note = buildPricingRequestNote('Pedanios 31/1 COS-CA')
    expect(note).toContain('Pedanios 31/1 COS-CA')
  })

  it('a quote character in the product name does not break the note', () => {
    // A seller-authored product name may legitimately carry a quote (e.g. a
    // strain nicknamed with one) — the note wraps the name in its own quotes
    // (D3: 'Pricing request for "<name>".'), so an embedded quote must not
    // truncate or corrupt the surrounding sentence.
    const note = buildPricingRequestNote('Pedanios 31/1 "Diesel" COS-CA')
    expect(note).toContain('Pedanios 31/1 "Diesel" COS-CA')
  })

  it('a very long product name still yields a note <= 280 characters (the server-side cap, actions.ts:53-55)', () => {
    const longName = 'X'.repeat(400)
    const note = buildPricingRequestNote(longName)
    expect(note.length).toBeLessThanOrEqual(280)
  })
})

describe('buildPricingRequestMetadata + PRODUCT_ID_KEY (HEL-58 D3/D4)', () => {
  it('the constant is exactly "product_id" — the dup-guard filter key', () => {
    expect(PRODUCT_ID_KEY).toBe('product_id')
  })

  it('returns an object whose only key is product_id, carrying the given id', () => {
    const meta = buildPricingRequestMetadata('11111111-1111-1111-1111-111111111111')
    expect(meta).toEqual({ product_id: '11111111-1111-1111-1111-111111111111' })
    expect(Object.keys(meta)).toEqual([PRODUCT_ID_KEY])
  })
})
