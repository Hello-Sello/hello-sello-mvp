// Pre-seeded data for the Discover prototype.
//
// Discover does TWO jobs and this prototype mocks both:
//   1. Supplier DIRECTORY  — browse sellers (grouped) → their products. Marcel Screen 1.
//   2. Ad / social FEED     — campaign calendar + ad posts ("B2B social network"). Marcel Screen 2/3.
//
// Visibility rule (locked 2026-06-07): listed-in-Discover = has a public shop.
//   has_public_shop=true  → appears in the directory (sellers).
//   has_public_shop=false → hidden; only reachable by exact-name search (buyers, e.g. pharmacies).
//
// Viewer = Aurora Deutschland (a seller browsing Discover).

export const VIEWER = { id: 'me-1', name: 'Aurora Deutschland GmbH', type: 'cultivator', country: 'DE', region: 'Berlin' };

// has_public_shop drives directory visibility. source/is_claimed/verification as before.
export const SEED_COMPANIES = [
  // --- sellers (public shop → listed) ---
  { id: 'co-aurora',  name: 'Aurora Cannabis',             type: 'cultivator', country: 'CA', region: 'Ontario',  tagline: 'Premium medical cannabis cultivator',        source: 'signup', is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: false },
  { id: 'co-craft',   name: 'Canadian Craft Growers',      type: 'cultivator', country: 'CA', region: 'BC',       tagline: 'Small-batch craft cannabis, GACP-certified', source: 'flowz',  is_claimed: false, verification_status: 'unverified',  has_public_shop: true,  has_us_in_records: false },
  { id: 'co-tilray',  name: 'Tilray Medical',              type: 'wholesaler', country: 'CA', region: 'Ontario',  tagline: 'Global medical cannabis supplier',           source: 'signup', is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: false },
  { id: 'co-bfarm',   name: 'BfArM-Approved Imports GmbH', type: 'importer',   country: 'DE', region: 'Frankfurt',tagline: 'EU-GMP certified pharmaceutical importer',   source: 'flowz',  is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: true  },
  { id: 'co-cologne', name: 'Cologne Med Distribution',    type: 'wholesaler', country: 'DE', region: 'Cologne',  tagline: 'Wholesale medical cannabis + accessories',   source: 'flowz',  is_claimed: false, verification_status: 'unverified',  has_public_shop: true,  has_us_in_records: false },
  { id: 'co-demecan', name: 'Demecan',                     type: 'cultivator', country: 'DE', region: 'Dresden',  tagline: 'German domestic cultivator',                 source: 'signup', is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: false },
  { id: 'co-canto',   name: 'Cantourage',                  type: 'importer',   country: 'DE', region: 'Berlin',   tagline: 'Fast-track import platform',                 source: 'signup', is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: false },
  { id: 'co-canna',   name: 'Cannamedical',                type: 'wholesaler', country: 'DE', region: 'Cologne',  tagline: 'Medical cannabis wholesaler',                source: 'signup', is_claimed: true,  verification_status: 'verified',   has_public_shop: true,  has_us_in_records: false },
  // --- buyers (no shop → hidden, search-only) ---
  { id: 'co-berlin',  name: 'Berlin Apotheke Nord',        type: 'pharmacy',   country: 'DE', region: 'Berlin',   tagline: 'Medical cannabis dispensing pharmacy',       source: 'flowz',  is_claimed: false, verification_status: 'unverified',  has_public_shop: false, has_us_in_records: true  },
  { id: 'co-munich',  name: 'München Cannabis-Apotheke',   type: 'pharmacy',   country: 'DE', region: 'Munich',   tagline: 'Specialty cannabis pharmacy',                source: 'flowz',  is_claimed: false, verification_status: 'unverified',  has_public_shop: false, has_us_in_records: false },
  { id: 'co-hamburg', name: 'Hamburg Apotheke Süd',        type: 'pharmacy',   country: 'DE', region: 'Hamburg',  tagline: 'Cannabis-licensed pharmacy chain',           source: 'flowz',  is_claimed: false, verification_status: 'unverified',  has_public_shop: false, has_us_in_records: true  }
];

// Products under sellers. side: 'supply' = offered for sale · 'demand' = wanted (the
// "See demand and supply" toggle from Marcel Screen 1). category groups the directory.
export const SEED_PRODUCTS = [
  { id: 'p-1',  company_id: 'co-aurora',  name: 'Aurora 20/1 Indica',          category: 'Flower',     side: 'supply' },
  { id: 'p-2',  company_id: 'co-aurora',  name: 'Aurora 1/20 CBD',             category: 'Flower',     side: 'supply' },
  { id: 'p-3',  company_id: 'co-craft',   name: 'Craft Pink Kush',             category: 'Flower',     side: 'supply' },
  { id: 'p-4',  company_id: 'co-craft',   name: 'Live Rosin Bubba Kush FE 800',category: 'Extract',    side: 'supply' },
  { id: 'p-5',  company_id: 'co-bfarm',   name: 'EU-GMP Flower Batch A',       category: 'Flower',     side: 'supply' },
  { id: 'p-6',  company_id: 'co-tilray',  name: 'Tilray THC25 Sativa',         category: 'Flower',     side: 'supply' },
  { id: 'p-7',  company_id: 'co-cologne', name: 'Vasco 30/1 Key Lime',         category: 'Flower',     side: 'supply' },
  { id: 'p-8',  company_id: 'co-demecan', name: 'Demecan Live Rosin SKU',      category: 'Extract',    side: 'supply' },
  { id: 'p-9',  company_id: 'co-canna',   name: 'Blue Lobster Flower',         category: 'Flower',     side: 'supply' },
  // demand-side listings (what these companies are looking to buy)
  { id: 'p-10', company_id: 'co-cologne', name: 'Wanted: High-THC Sativa, 50kg/mo', category: 'Flower', side: 'demand' },
  { id: 'p-11', company_id: 'co-canto',   name: 'Wanted: GMP Live Rosin, EU origin', category: 'Extract', side: 'demand' }
];

// Ad / social feed posts. post_type drives the chip colour + template. campaign_month
// places it on the calendar. target_* = "legal advertising to verified audience".
export const SEED_POSTS = [
  { id: 'post-1', company_id: 'co-demecan', post_type: 'new_product', headline: 'Additional Live Rosin SKU',         campaign_month: 'September', target_country: 'DE', target_type: 'pharmacy', status: 'active' },
  { id: 'post-2', company_id: 'co-canto',   post_type: 'new_product', headline: 'Launch Vasco 30/1 Key Lime',         campaign_month: 'August',    target_country: 'DE', target_type: 'pharmacy', status: 'active' },
  { id: 'post-3', company_id: 'co-canto',   post_type: 'new_batch',   headline: 'New Batch Blue Lobster',            campaign_month: 'October',   target_country: 'DE', target_type: 'pharmacy', status: 'active' },
  { id: 'post-4', company_id: 'co-canna',   post_type: 'new_product', headline: 'Additional Live Rosin SKU',         campaign_month: 'August',    target_country: 'DE', target_type: 'pharmacy', status: 'active' },
  { id: 'post-5', company_id: 'co-craft',   post_type: 'video',       headline: 'New Canadian Craft Flower launch in Germany', campaign_month: 'September', target_country: 'DE', target_type: 'pharmacy', status: 'active' }
];

export const COMPANY_TYPES = [
  { code: 'cultivator', description: 'Cultivator', sort_order: 1 },
  { code: 'wholesaler', description: 'Wholesaler', sort_order: 2 },
  { code: 'importer',   description: 'Importer',   sort_order: 3 },
  { code: 'pharmacy',   description: 'Pharmacy',   sort_order: 4 }
];

export const COUNTRIES = [{ code: 'DE', label: 'Germany' }, { code: 'CA', label: 'Canada' }];
export const CAMPAIGN_MONTHS = ['August', 'September', 'October'];

// post_type → {label, chip colour classes} for the feed/calendar.
export const POST_TYPES = {
  new_product: { label: 'New product', chip: 'bg-blue-600 text-white' },
  new_batch:   { label: 'New batch',   chip: 'bg-amber-600 text-white' },
  packaging:   { label: 'New packaging', chip: 'bg-slate-600 text-white' },
  video:       { label: 'Video post',  chip: 'bg-emerald-600 text-white' },
  job:         { label: 'Job post',    chip: 'bg-purple-600 text-white' }
};

export function typeLabel(code) { return COMPANY_TYPES.find(t => t.code === code)?.description ?? code; }
export function countryLabel(code) { return COUNTRIES.find(c => c.code === code)?.label ?? code; }
