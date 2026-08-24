/**
 * RED unit contract for the buyer-facing company row mapper (T01, HEL-55) AND
 * the T02 (HEL-56) additions: `toShopCompany` and the `ShopRow → ShopProduct`
 * product mapper.
 *
 * getDiscoverableCompany is a thin read over get_discoverable_company (the
 * verified-caller gate, the primary-filter/I8, and the metadata leak rule are
 * all proven server-side by pgTAP:
 * supabase/tests/discoverable_company_chrome_test.sql). The unit-testable
 * logic is the pure row mapper — and only its WIRING: which RPC field reaches
 * which reused helper, and that `type_codes` feeds BOTH `tags` (raw codes)
 * and `categories` (labelled), never the reverse. `parseLinks`
 * (src/modules/catalog/shop.ts) and `deriveInitialLocations`
 * (src/modules/catalog/locations.ts) have their own specs and are not
 * re-tested here (PLAN-T01.md "Test surface", round 2 correction).
 *
 * Transposition guard (critic note 7, 2026-08-20): T01 EXTRACTED this mapper,
 * moving 11 pre-existing fields into a new function. The 5 new columns are
 * guarded by distinct sentinels; the 11 moved ones had no guard at either
 * level, which made the diff's largest mechanical risk its only untested part.
 * The last test below closes that — every field gets a value unique across the
 * whole row, so any two-field swap fails.
 *
 * ⚠️ RED-FIRST (T02, PLAN-T02.md rev 3): `toShopCompany` and the product row
 * mapper (named `mapDiscoverShopRow` here, mirroring this file's own
 * `mapDiscoverCompanyRow` and `src/app/discover/people.ts`'s
 * `mapDiscoverPersonRow` — the plan does not pin an exact name for this one,
 * only `toShopCompany`'s) are NOT YET EXPORTED from `companies.ts`. Importing
 * them makes the WHOLE file fail to load until T02 lands both — that failure
 * covers every test below, including the pre-existing T01 ones, and is the
 * expected RED state, not a defect in this file. `logoUrl`/`coverUrl` were
 * also RENAMED to `logoPath`/`coverPath` this round (rev 3, B2 — see plan
 * "(b)"), so the two tests that used to assert the old names are updated in
 * place below, not left as a second, now-contradictory pair.
 *
 * ⚠️ RED-FIRST, continued (T05, HEL-59, PLAN-T05.md rev 3): `fullRow` gains 12
 * new sentinel fields (cbg_percent, cbn_percent, terpene_percent, cultivator,
 * lineage_parent_a, lineage_parent_b, irradiation_code, packaging_material,
 * resealable, location, pack_sizes, media) — the widening `ShopRow` (D4) and
 * `mapDiscoverShopRow` (D2/D3a/D5) must gain to stop returning null/[] for
 * them. Each sentinel is DISTINCT (L-012/L-020 pattern) so a transposition —
 * two fields swapped — cannot pass silently. The two T02-era assertions that
 * this ticket makes stale (`location` forced null; `media` forced []) are
 * corrected in place below, not left contradicting the new tests.
 */
import { describe, it, expect } from 'vitest'
import { mapDiscoverCompanyRow, toShopCompany, mapDiscoverShopRow } from '@/app/discover/companies'

const urlFor = (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`

// Row shape the RPC returns after PLAN-T01's migration: the existing 11
// columns (unchanged) plus the 5 new ones — address, warehouse_location,
// updated_at, links, locations. `tags` is NOT a new RPC column (2026-08-20
// TICKETS.md amendment) — the mapper derives it from the existing
// `type_codes`, so the fixture carries no separate `tags` field.
const baseRow = {
  id: 'c1',
  name: 'Bloom Pharma',
  tagline: 'Quality first',
  about: 'A verified seller.',
  country: 'DE',
  website: 'https://bloom.test',
  logo_path: 'logos/bloom.png',
  cover_path: 'covers/bloom.png',
  type_codes: ['eu_gmp_cultivator', 'wholesaler'],
  connection_state: 'requested' as const,
  pricing_requested: false,
  address: 'PLANT-ADDR-FIXTURE',
  warehouse_location: 'PLANT-WH-FIXTURE',
  updated_at: '2026-08-20T10:00:00.000Z',
  links: [{ platform: 'custom', value: 'LINKS-SENTINEL', label: 'Site' }],
  locations: [{ label: 'Warehouse 1', value: 'LOCATIONS-SENTINEL' }],
}

describe('mapDiscoverCompanyRow (T01, HEL-55) — wiring only', () => {
  it('wires r.links through parseLinks and r.locations through deriveInitialLocations — never swapped', () => {
    const out = mapDiscoverCompanyRow(baseRow, urlFor)

    // parseLinks ran on r.links: output shape is ShopLink[] carrying the sentinel.
    expect(out.links).toHaveLength(1)
    expect(out.links[0]).toMatchObject({ platform: 'custom', value: 'LINKS-SENTINEL' })

    // deriveInitialLocations ran on r.locations: output shape is
    // WarehouseLocation[] carrying the OTHER sentinel.
    expect(out.locations).toHaveLength(1)
    expect(out.locations[0]).toMatchObject({ label: 'Warehouse 1', value: 'LOCATIONS-SENTINEL' })

    // Swap-guard: distinct sentinel values mean a reversed wire (r.locations
    // -> parseLinks, r.links -> deriveInitialLocations) would fail the two
    // assertions above already, but assert the negative directly too — a
    // sentinel from one field must never appear on the other's output.
    expect(JSON.stringify(out.links)).not.toContain('LOCATIONS-SENTINEL')
    expect(JSON.stringify(out.locations)).not.toContain('LINKS-SENTINEL')
  })

  it('feeds type_codes to BOTH tags (raw codes) and categories (labelled) — not reversed', () => {
    const out = mapDiscoverCompanyRow(baseRow, urlFor)

    // tags: deviation 1 — reused from type_codes, RAW, no categoryLabel pass.
    expect(out.tags).toEqual(['eu_gmp_cultivator', 'wholesaler'])
    // categories: the pre-existing labelled projection, unchanged.
    expect(out.categories).toEqual(['EU-GMP Cultivator', 'Wholesaler'])
    // If the wiring were reversed (tags labelled, categories raw) or shared
    // a single mapped array, these two would be equal. They must not be.
    expect(out.tags).not.toEqual(out.categories)
  })

  it('carries address, warehouseLocation and updatedAt straight through as strings', () => {
    const out = mapDiscoverCompanyRow(baseRow, urlFor)

    expect(out.address).toBe('PLANT-ADDR-FIXTURE')
    expect(out.warehouseLocation).toBe('PLANT-WH-FIXTURE')
    // updated_at is timestamptz on the RPC; the mapper must keep it a string
    // (Shop.company.updated_at: string | null), never coerce to a Date.
    expect(out.updatedAt).toBe('2026-08-20T10:00:00.000Z')
    expect(typeof out.updatedAt).toBe('string')
  })

  it('malformed metadata shape: non-array links/locations and null type_codes all degrade to empty, with no throw', () => {
    const out = mapDiscoverCompanyRow(
      {
        ...baseRow,
        links: 'not-an-array' as unknown as typeof baseRow.links,
        locations: { unexpected: 'shape' } as unknown as typeof baseRow.locations,
        warehouse_location: null,
        type_codes: null,
      },
      urlFor,
    )

    expect(out.links).toEqual([])
    expect(out.locations).toEqual([])
    expect(out.tags).toEqual([])
    expect(out.categories).toEqual([])
  })
})

// ---- Transposition guard for the 11 fields the extraction MOVED ----
//
// Every input carries a value unique across the row, so a swap of any two
// fields cannot produce a passing result. This is deliberately a whole-object
// assertion rather than field-by-field: a per-field check written from the same
// mental model as the mapper reproduces its mistakes, and an added-but-unmapped
// field would slip past.
describe('mapDiscoverCompanyRow — the 11 moved fields survived the extraction', () => {
  it('maps every pre-existing field to its own destination, none transposed', () => {
    const row = {
      ...baseRow,
      id: 'ID-VAL',
      name: 'NAME-VAL',
      tagline: 'TAGLINE-VAL',
      about: 'ABOUT-VAL',
      country: 'DE',
      website: 'WEBSITE-VAL',
      logo_path: 'LOGO-PATH',
      cover_path: 'COVER-PATH',
      type_codes: ['distributor'],
      connection_state: 'requested' as const,
      pricing_requested: true,
    }

    const out = mapDiscoverCompanyRow(row, urlFor)

    expect(out.id).toBe('ID-VAL')
    expect(out.name).toBe('NAME-VAL')
    expect(out.tagline).toBe('TAGLINE-VAL')
    expect(out.about).toBe('ABOUT-VAL')
    expect(out.countryCode).toBe('DE')
    expect(out.website).toBe('WEBSITE-VAL')
    // logo and cover share a bucket — the guard is that they do NOT swap.
    // Rev 3 (B2/B8): these are now raw PATHS (logoPath/coverPath), never
    // resolved through urlFor — see the dedicated toShopCompany/logo_path
    // describe block below for why (L-015).
    expect(out.logoPath).toBe('LOGO-PATH')
    expect(out.coverPath).toBe('COVER-PATH')
    expect(out.connectionState).toBe('requested')
    expect(out.pricingRequested).toBe(true)
    // countryName is DERIVED from country, not passed through: assert it is
    // resolved rather than echoed, without pinning the label table's wording.
    expect(out.countryName).not.toBe('DE')
    expect(out.countryName.length).toBeGreaterThan(0)
  })

  it('carries logo_path/cover_path straight through as PATHS — rev 3 retires the resolved-URL fields (PLAN-T02.md "(b)")', () => {
    // Rev 3, B2/B8: `logoUrl`/`coverUrl` are REPLACED by `logoPath`/`coverPath`
    // — raw storage paths, never resolved through `urlFor`. `ShopView` resolves
    // them itself via `mediaUrl(path)`; handing it an already-resolved URL
    // produces "…/shop-media/https://…" (L-015). This is the one assertion
    // that would have caught that class of defect.
    const out = mapDiscoverCompanyRow(baseRow, urlFor)
    expect(out.logoPath).toBe('logos/bloom.png')
    expect(out.coverPath).toBe('covers/bloom.png')
    expect(out.logoPath).not.toMatch(/^https?:/)
    expect(out.coverPath).not.toMatch(/^https?:/)
  })

  it('does not invent a path for a null column', () => {
    const out = mapDiscoverCompanyRow(
      { ...baseRow, logo_path: null, cover_path: null },
      urlFor,
    )
    expect(out.logoPath).toBeNull()
    expect(out.coverPath).toBeNull()
  })
})

// ---- T02 (HEL-56, PLAN-T02.md rev 3) — toShopCompany ----
//
// `DiscoverCompanyProfile → Shop["company"]`. Unit-tested because `tsc`
// provably cannot catch a representation mismatch between two `string | null`
// sides (L-015): feeding a resolved URL where ShopView expects a storage path
// compiles clean and still breaks the banner/logo live.
describe('toShopCompany (T02, HEL-56) — the six renamed fields, distinct sentinels', () => {
  // Every field carries its OWN sentinel — a transposed rename (e.g. `about`
  // landing in `warehouse_location`) must fail, not coincidentally pass.
  const fullProfile = {
    id: 'PROFILE-ID',
    name: 'PROFILE-NAME',
    tagline: 'PROFILE-TAGLINE',
    about: 'PROFILE-ABOUT',
    countryCode: 'PROFILE-COUNTRY-CODE',
    countryName: 'Ignored — toShopCompany does not consume this',
    website: 'PROFILE-WEBSITE',
    logoPath: 'logos/PROFILE-LOGO-PATH.png',
    coverPath: 'covers/PROFILE-COVER-PATH.png',
    categories: ['ignored-category'],
    connectionState: 'connected' as const,
    pricingRequested: false,
    tags: ['TAG-A', 'TAG-B'],
    address: 'PROFILE-ADDRESS',
    warehouseLocation: 'PROFILE-WAREHOUSE-LOCATION',
    updatedAt: 'PROFILE-UPDATED-AT',
    links: [{ platform: 'custom' as const, value: 'PROFILE-LINK-VALUE' }],
    locations: [{ label: 'Warehouse 1', value: 'PROFILE-LOCATION-VALUE' }],
  }

  it('renames about→description, countryCode→country, updatedAt→updated_at, warehouseLocation→warehouse_location, logoPath→logo_path, coverPath→cover_path', () => {
    const out = toShopCompany(fullProfile)
    expect(out.description).toBe('PROFILE-ABOUT')
    expect(out.country).toBe('PROFILE-COUNTRY-CODE')
    expect(out.updated_at).toBe('PROFILE-UPDATED-AT')
    expect(out.warehouse_location).toBe('PROFILE-WAREHOUSE-LOCATION')
    expect(out.logo_path).toBe('logos/PROFILE-LOGO-PATH.png')
    expect(out.cover_path).toBe('covers/PROFILE-COVER-PATH.png')
  })

  it('logo_path/cover_path are PATHS, not URLs — the assertion that would have caught the double-URL defect (L-015)', () => {
    const out = toShopCompany(fullProfile)
    expect(out.cover_path).not.toMatch(/^https?:/)
    expect(out.logo_path).not.toMatch(/^https?:/)
  })

  it('carries the 7 passthrough fields (id, name, tagline, website, address, links, locations) plus tags, unchanged', () => {
    const out = toShopCompany(fullProfile)
    expect(out.id).toBe('PROFILE-ID')
    expect(out.name).toBe('PROFILE-NAME')
    expect(out.tagline).toBe('PROFILE-TAGLINE')
    expect(out.website).toBe('PROFILE-WEBSITE')
    expect(out.address).toBe('PROFILE-ADDRESS')
    expect(out.links).toEqual([{ platform: 'custom', value: 'PROFILE-LINK-VALUE' }])
    expect(out.locations).toEqual([{ label: 'Warehouse 1', value: 'PROFILE-LOCATION-VALUE' }])
    expect(out.tags).toEqual(['TAG-A', 'TAG-B'])
  })
})

// ---- T02 (HEL-56, PLAN-T02.md rev 3) — the ShopRow → ShopProduct product mapper ----
//
// Three fields can silently destroy a shipped guarantee (plan "The mapper's
// field rules"): price_public (Request-pricing dies if hardcoded true),
// profile_visible (must be ABSENT, never a seller-state leak to a buyer), and
// tiers (must go through mapTiers, never a snake→camel cast — L-016/B4).
describe('mapDiscoverShopRow (T02, HEL-56) — ShopRow → ShopProduct', () => {
  const fullRow = {
    id: 'PROD-ID',
    name: 'PROD-NAME',
    cultivar: 'PROD-CULTIVAR',
    thc_percent: 11,
    cbd_percent: 22,
    pack_size_grams: 33,
    unit_code: 'PROD-UNIT',
    local_code_pzn: 'PROD-PZN',
    dominance_code: 'PROD-DOMINANCE',
    country_of_origin: 'PROD-COUNTRY-OF-ORIGIN',
    region: 'PROD-REGION',
    images: [
      { id: 'img-1', path: 'IMAGES-PATH-1.png', position: 1 },
      { id: 'img-0', path: 'IMAGES-PATH-0.png', position: 0 },
    ],
    price_public: false, // the fixture that matters — see the dedicated test below
    price_per_gram: 6.5,
    tiers: [
      { id: 't1', min_grams: 500, price_per_gram: 4.8 },
      { id: 't2', min_grams: 1000, price_per_gram: 4.2 },
    ],
    // ---- T05 (HEL-59) additions — 12 new OUT columns, each a DISTINCT
    // sentinel so a transposition (two fields swapped) cannot pass silently.
    cbg_percent: 44,
    cbn_percent: 55,
    terpene_percent: 66,
    cultivator: 'PROD-CULTIVATOR',
    lineage_parent_a: 'PROD-LINEAGE-A',
    lineage_parent_b: 'PROD-LINEAGE-B',
    irradiation_code: 'PROD-IRRADIATION',
    packaging_material: 'PROD-PACKAGING',
    resealable: true,
    location: 'PROD-LOCATION',
    // finite, positive filter (D3a/B8, parsePackSizes wiring): -1 and 0 must
    // be dropped, non-numbers ignored — only [7, 12] should survive.
    pack_sizes: [7, -1, 12, 0, 'not-a-number'] as unknown as number[],
    media: [
      { id: 'm0', kind: 'video_link', path: null, url: 'https://video.test/0', label: null },
      { id: 'm1', kind: 'coa', path: 'MEDIA-PATH-1.pdf', url: null, label: 'MEDIA-LABEL-1' },
    ],
  }

  it('forwards r.price_public verbatim when false — hardcoding true would silently kill Request-pricing for every buyer', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.price_public).toBe(false)
  })

  it('forwards r.price_public verbatim when true too — both directions, not just the false case', () => {
    const out = mapDiscoverShopRow({ ...fullRow, price_public: true })
    expect(out.price_public).toBe(true)
  })

  it('forwards r.price_per_gram (appears in neither of rev 2\'s lists, round 2 N1)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.price_per_gram).toBe(6.5)
  })

  it('omits profile_visible from the object entirely — never invents seller state for a buyer', () => {
    const out = mapDiscoverShopRow(fullRow)
    // Deliberately NOT toBeUndefined(): that passes even when the key exists
    // holding `undefined`, which is not the same bug-catching shape as an
    // ABSENT key (LEARNINGS L-012-adjacent framing repeated in PLAN-T02.md).
    expect('profile_visible' in out).toBe(false)
  })

  it('maps tiers through mapTiers as camelCase — never a snake_case cast (round 2 B4, L-016)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.tiers).toEqual([
      { minGrams: 500, pricePerGram: 4.8 },
      { minGrams: 1000, pricePerGram: 4.2 },
    ])
    // A cast (not a real mapTiers call) would leave the raw snake_case keys
    // and `minGrams` would read undefined.
    expect(out.tiers[0].minGrams).toBe(500)
    expect(out.tiers[0].pricePerGram).toBe(4.8)
  })

  it('derives bundle_threshold_grams / bundle_price_per_gram from tiers[0], matching shop.ts:254-255', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.bundle_threshold_grams).toBe(500)
    expect(out.bundle_price_per_gram).toBe(4.8)
  })

  it('degrades a null/missing tiers column to an empty ladder and null bundle_* — no throw', () => {
    const out = mapDiscoverShopRow({ ...fullRow, tiers: null })
    expect(out.tiers).toEqual([])
    expect(out.bundle_threshold_grams).toBeNull()
    expect(out.bundle_price_per_gram).toBeNull()
  })

  it('maps images to {id, path}, sorted by position, and the paths are NOT resolved URLs', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.images).toEqual([
      { id: 'img-0', path: 'IMAGES-PATH-0.png' },
      { id: 'img-1', path: 'IMAGES-PATH-1.png' },
    ])
    expect(out.images.every((im: { path: string }) => !/^https?:/.test(im.path))).toBe(true)
  })

  it('forwards every straight-passthrough scalar field with distinct sentinels, none transposed', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.id).toBe('PROD-ID')
    expect(out.name).toBe('PROD-NAME')
    expect(out.cultivar).toBe('PROD-CULTIVAR')
    expect(out.thc_percent).toBe(11)
    expect(out.cbd_percent).toBe(22)
    expect(out.pack_size_grams).toBe(33)
    expect(out.unit_code).toBe('PROD-UNIT')
    expect(out.local_code_pzn).toBe('PROD-PZN')
    expect(out.dominance_code).toBe('PROD-DOMINANCE')
    expect(out.country_of_origin).toBe('PROD-COUNTRY-OF-ORIGIN')
    expect(out.region).toBe('PROD-REGION')
  })

  it('never invents supplier_product_code (N3 — confidentiality; the RPC never returns it)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.supplier_product_code).toBeNull()
  })

  it('forwards location from the row (T05, HEL-59 — the RPC now returns it; produces the location tabs)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.location).toBe('PROD-LOCATION')
  })

  it('still supplies null/[] for the two fields the RPC NEVER returns, even after T05: supplier_product_code (confidentiality, I18) and batches (no lot list, D5)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.supplier_product_code).toBeNull()
    expect(out.batches).toEqual([])
  })

  // ---- T05 (HEL-59, PLAN-T05.md rev 3) — the 12-column widening ----
  it('fills cbg_percent and cbn_percent from the row, distinctly (T05)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.cbg_percent).toBe(44)
    expect(out.cbn_percent).toBe(55)
  })

  it('derives terpPercent from r.terpene_percent verbatim — the RPC already applies manual-first/representative-batch-fallback server-side (D2), so the mapper is a straight passthrough, never a re-derivation', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.terpPercent).toBe(66)
  })

  it('fills cultivator, lineage_parent_a/b, irradiation_code, packaging_material, resealable from the row (T05)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.cultivator).toBe('PROD-CULTIVATOR')
    expect(out.lineage_parent_a).toBe('PROD-LINEAGE-A')
    expect(out.lineage_parent_b).toBe('PROD-LINEAGE-B')
    expect(out.irradiation_code).toBe('PROD-IRRADIATION')
    expect(out.packaging_material).toBe('PROD-PACKAGING')
    expect(out.resealable).toBe(true)
  })

  it('maps pack_sizes through the shared parsePackSizes wrapper — finite, positive numbers only (D3a/B8, ADR :474-476: the SAME parser the seller reads uses, never a re-implemented filter)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.packSizes).toEqual([7, 12])
  })

  it('maps media to ProductMedia[] — no longer forced empty (B7/D5): batches stays [] (no lot list), media does not (it rides the RPC)', () => {
    const out = mapDiscoverShopRow(fullRow)
    expect(out.media).toEqual([
      { id: 'm0', kind: 'video_link', path: null, url: 'https://video.test/0', label: null },
      { id: 'm1', kind: 'coa', path: 'MEDIA-PATH-1.pdf', url: null, label: 'MEDIA-LABEL-1' },
    ])
  })
})
