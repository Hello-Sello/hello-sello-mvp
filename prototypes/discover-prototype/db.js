// Mock DB for the Discover prototype.
// Tables are plain arrays; _meta holds session/view state. Persists to localStorage.
//
// The data panel mirrors these tables so clicking through makes the schema needs
// obvious — that's the payload that feeds SCHEMA-DRAFT.

import { SEED_COMPANIES, SEED_PRODUCTS, SEED_POSTS, COMPANY_TYPES, VIEWER } from './seed.js';

const STORAGE_KEY = 'hellosello-discover-db';

export function freshDB() {
  return {
    company: SEED_COMPANIES.map(c => ({ ...c })),     // sellers (shop) + buyers (no shop)
    product: SEED_PRODUCTS.map(p => ({ ...p })),       // supply + demand listings under sellers
    discovery_post: SEED_POSTS.map(p => ({ ...p })),   // the ad / social feed
    company_type: COMPANY_TYPES.map(t => ({ ...t })),
    profile_claim: [],
    connection_request: [],
    _meta: {
      viewer_company_id: VIEWER.id,
      tab: 'directory',         // Variant A: 'directory' | 'feed'
      side: 'supply',           // demand/supply toggle: 'supply' | 'demand'
      q: '',                    // search box — also reveals hidden (no-shop) companies
      nextId: 1,
      lastWrite: null
    }
  };
}

export function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return freshDB();
  try {
    const loaded = JSON.parse(raw);
    const fresh = freshDB();
    for (const k of Object.keys(fresh)) {
      if (k !== '_meta' && loaded[k] == null) loaded[k] = fresh[k];
    }
    loaded._meta = { ...fresh._meta, ...(loaded._meta || {}) };
    return loaded;
  } catch { return freshDB(); }
}

export function saveDB(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
export function resetDB() { localStorage.removeItem(STORAGE_KEY); }
export function nextId(db) { const id = db._meta.nextId || 1; db._meta.nextId = id + 1; return id; }

// --- visibility rule: who shows in the directory ---

// Listed by default = sellers with a public shop (excluding the viewer).
export function listedCompanies(db) {
  return db.company.filter(c => c.id !== db._meta.viewer_company_id && c.has_public_shop);
}

// Search reveal = hidden (no-shop) companies whose name matches the query. This is
// the Instagram rule: buyers aren't listed, but an exact-ish name search finds them.
export function searchRevealed(db) {
  const q = db._meta.q.trim().toLowerCase();
  if (!q) return [];
  return db.company.filter(c => c.id !== db._meta.viewer_company_id && !c.has_public_shop && c.name.toLowerCase().includes(q));
}

// Products for a company, filtered by the demand/supply toggle.
export function productsFor(db, companyId, side) {
  return db.product.filter(p => p.company_id === companyId && p.side === side);
}

export function companyName(db, id) { return db.company.find(c => c.id === id)?.name ?? id; }

// --- actions (each returns the table it wrote so the panel can flag it) ---

export function requestConnection(db, companyId) {
  if (db.connection_request.some(r => r.target_company_id === companyId && r.from_company_id === db._meta.viewer_company_id)) return null;
  const id = `conn-${nextId(db)}`;
  db.connection_request.push({ id, from_company_id: db._meta.viewer_company_id, target_company_id: companyId, status: 'pending', source_surface: 'discover' });
  db._meta.lastWrite = { table: 'connection_request', id };
  return 'connection_request';
}

export function claimProfile(db, companyId) {
  const co = db.company.find(c => c.id === companyId);
  if (!co || co.is_claimed) return null;
  co.is_claimed = true; co.source = 'signup';
  const id = `claim-${nextId(db)}`;
  db.profile_claim.push({ id, company_id: companyId, claimed_by: db._meta.viewer_company_id, claimed_at: 'now' });
  db._meta.lastWrite = { table: 'profile_claim', id };
  return 'profile_claim';
}

export function isRequested(db, companyId) {
  return db.connection_request.some(r => r.target_company_id === companyId);
}
