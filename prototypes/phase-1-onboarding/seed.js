// Pre-seeded data for the prototype.
// SEED_COMPANIES = the "FLOWZ-scraped" companies users see on Discover.
// DEFAULT_GROUPS = sensible Notion-style defaults at company setup.
// SAMPLE_CONTACTS = the contacts a Gmail/Outlook metadata scan would return.

export const SEED_COMPANIES = [
  { id: 'seed-1', name: 'Aurora Cannabis',              type: 'distributor', country: 'CA', tagline: 'Premium medical cannabis cultivator' },
  { id: 'seed-2', name: 'Canadian Craft Growers',       type: 'distributor', country: 'CA', tagline: 'Small-batch craft cannabis, GACP-certified' },
  { id: 'seed-3', name: 'BfArM-Approved Imports GmbH',  type: 'distributor', country: 'DE', tagline: 'EU-GMP certified pharmaceutical importer' },
  { id: 'seed-4', name: 'Berlin Apotheke Nord',         type: 'pharmacy',    country: 'DE', tagline: 'Medical cannabis dispensing pharmacy' },
  { id: 'seed-5', name: 'München Cannabis-Apotheke',    type: 'pharmacy',    country: 'DE', tagline: 'Specialty cannabis pharmacy, narcotics-licensed' },
  { id: 'seed-6', name: 'Tilray Medical',               type: 'distributor', country: 'CA', tagline: 'Global medical cannabis supplier' },
  { id: 'seed-7', name: 'Hamburg Apotheke Süd',         type: 'pharmacy',    country: 'DE', tagline: 'Cannabis-licensed pharmacy chain' },
  { id: 'seed-8', name: 'Cologne Med Distribution',     type: 'distributor', country: 'DE', tagline: 'Wholesale medical cannabis + accessories' }
];

export const DEFAULT_GROUPS = [
  { name: 'Sales Team',       description: 'Outbound offers and customer relationships' },
  { name: 'Procurement Team', description: 'Inventory sourcing and supplier deals' },
  { name: 'Compliance / QA',  description: 'Cannabis regulatory + quality assurance' },
  { name: 'Approver',         description: 'Authorized to sign off on pricelist + sensitive actions' }
];

export const PERMISSION_ACTIONS = [
  'View deals',
  'Create deals',
  'Edit pricelist',
  'Approve pricelist edits',
  'Accept incoming connections',
  'Manage Groups',
  'Add Superadmin',
  'Manage billing'
];

export const SAMPLE_CONTACTS = [
  { email: 'sarah.kim@berlin-apo-nord.de',       display_name: 'Sarah Kim',           first_seen: '2025-08-12', last_seen: '2026-05-20', email_count: 47  },
  { email: 'thomas.weber@muenchen-cannabis.de',  display_name: 'Thomas Weber',        first_seen: '2025-11-03', last_seen: '2026-05-22', email_count: 23  },
  { email: 'orders@hamburg-apo.de',              display_name: 'Hamburg Apotheke',    first_seen: '2026-02-14', last_seen: '2026-05-18', email_count: 8   },
  { email: 'm.schultz@cologne-med.de',           display_name: 'Michael Schultz',     first_seen: '2025-06-01', last_seen: '2026-04-30', email_count: 156 },
  { email: 'info@tilray.com',                    display_name: 'Tilray Sales',        first_seen: '2024-09-22', last_seen: '2026-05-15', email_count: 12  },
  { email: 'partnerships@aurora.ca',             display_name: 'Aurora Partnerships', first_seen: '2025-01-15', last_seen: '2026-05-21', email_count: 34  }
];

// Hint for the contact-tagging UI — naive role inference.
export function suggestRole(c) {
  if (/apo|pharm/.test(c.email)) return 'customer';
  if (/aurora|tilray|cologne/.test(c.email)) return 'supplier';
  return 'unknown';
}

// Sensible default permissions per group at setup time.
export function isDefaultPermission(action, groupName) {
  if (groupName === 'Sales Team')       return ['View deals', 'Create deals', 'Edit pricelist'].includes(action);
  if (groupName === 'Procurement Team') return ['View deals', 'Create deals'].includes(action);
  if (groupName === 'Compliance / QA')  return ['View deals'].includes(action);
  if (groupName === 'Approver')         return ['View deals', 'Create deals', 'Edit pricelist', 'Approve pricelist edits'].includes(action);
  return false;
}
