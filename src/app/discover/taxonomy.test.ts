/**
 * RED unit contract for the Discover company taxonomy (Lane B, DISC-3).
 *
 * After the business-category migration (20260704090000) suppliers are tagged
 * gacp_cultivator / eu_gmp_cultivator / tga_gmp_cultivator / manufacturer_pharma
 * — none of which the old 4-entry CATEGORY_LABELS or the 3-entry SELLER_TYPES gate
 * knew, so every supplier rendered mislabelled AND wrongly hidden as "pharmacy-only".
 * This pins the fixed taxonomy: all 8 activity codes labelled, and "listed =
 * anything that is not pharmacy-only".
 *
 * ⚠️  RED-FIRST: src/app/discover/taxonomy.ts doesn't exist yet → import fails.
 */
import { describe, it, expect } from 'vitest'
import { categoryLabel, isListedCompany } from '@/app/discover/taxonomy'

const CODES = [
  'pharmacy', 'wholesaler', 'importer', 'gacp_cultivator',
  'eu_gmp_cultivator', 'tga_gmp_cultivator', 'manufacturer_pharma', 'other',
] as const

describe('categoryLabel — all 8 migrated codes (DISC-3)', () => {
  it('maps every code to a human label (no raw code / title-case fallback leaks through)', () => {
    const expected: Record<(typeof CODES)[number], string> = {
      pharmacy: 'Pharmacy',
      wholesaler: 'Wholesaler',
      importer: 'Importer',
      gacp_cultivator: 'GACP Cultivator',
      eu_gmp_cultivator: 'EU-GMP Cultivator',
      tga_gmp_cultivator: 'TGA-GMP Cultivator',
      manufacturer_pharma: 'Manufacturer Pharma',
      other: 'Other',
    }
    for (const code of CODES) expect(categoryLabel(code)).toBe(expected[code])
  })

  it('does not know the dropped legacy `cultivator` code as a first-class label', () => {
    // it may fall back to a title-cased string, but must not be a curated entry
    expect(categoryLabel('cultivator')).toBe('Cultivator') // fallback, acceptable
  })
})

describe('isListedCompany — hide ONLY pharmacy-only (DISC-3)', () => {
  it('lists a company with any non-pharmacy activity (each of the 7 non-pharmacy labels)', () => {
    for (const code of CODES) {
      if (code === 'pharmacy') continue
      expect(isListedCompany([categoryLabel(code)])).toBe(true)
    }
  })

  it('hides a pharmacy-only company', () => {
    expect(isListedCompany(['Pharmacy'])).toBe(false)
  })

  it('lists a company that is Pharmacy AND something else', () => {
    expect(isListedCompany(['Pharmacy', 'Wholesaler'])).toBe(true)
  })

  it('lists an untagged company (no categories) — it is not pharmacy-only', () => {
    expect(isListedCompany([])).toBe(true)
  })
})
