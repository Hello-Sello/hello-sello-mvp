// The three Discover variants. Each shows BOTH jobs (supplier directory + ad/social
// feed) with a radically different combination structure:
//
//   A — Tabs        : Directory tab | Feed tab (clean separation)
//   B — Feed-first  : social ad-feed is the main scroll, directory in a side rail
//   C — Unified     : one directory scroll with ad posts interleaved (Instagram-style)
//
// Marcel's ideas grafted in: supplier→products hierarchy, the demand/supply toggle,
// and the campaign calendar. Visibility rule enforced: only public-shop sellers are
// listed; buyers surface only via search.

import { typeLabel, countryLabel, POST_TYPES, CAMPAIGN_MONTHS } from './seed.js';
import { isRequested, listedCompanies, searchRevealed, productsFor, companyName } from './db.js';

export const VARIANT_NAMES = { A: 'Tabs (Directory | Feed)', B: 'Feed-first + rail', C: 'Unified feed' };

// --- shared atoms ---------------------------------------------------------

function verifiedBadge(co) {
  return co.verification_status === 'verified'
    ? `<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">✓ Verified</span>`
    : `<span class="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">Unverified</span>`;
}
function claimBadge(co) {
  return co.is_claimed ? '' : `<span class="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Unclaimed · FLOWZ</span>`;
}
function connectBtn(db, co) {
  return isRequested(db, co.id)
    ? `<button disabled class="text-xs px-3 py-1.5 rounded bg-slate-100 text-slate-400 border border-slate-200">Requested ✓</button>`
    : `<button data-action="connect" data-id="${co.id}" class="text-xs px-3 py-1.5 rounded bg-pink-600 text-white hover:bg-pink-700">Connect</button>`;
}
function claimBtn(co) {
  return co.is_claimed ? '' : `<button data-action="claim" data-id="${co.id}" class="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50">Claim</button>`;
}

function searchBar(db) {
  return `<input data-meta="q" value="${db._meta.q}" placeholder="Search for company, product or service…"
    class="w-full px-4 py-2.5 rounded-full border border-pink-200 bg-pink-50 text-sm mb-4" />`;
}

function sideToggle(db) {
  const opt = (val, label) => `<button data-meta-set="side" data-val="${val}"
    class="px-3 py-1 text-xs rounded-full ${db._meta.side === val ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">${label}</button>`;
  return `<div class="flex items-center gap-2 mb-3"><span class="text-xs text-slate-400">See:</span>${opt('supply', 'Supply')}${opt('demand', 'Demand')}</div>`;
}

// A supplier with its products (Marcel Screen 1 hierarchy). side from the toggle.
function supplierBlock(db, co) {
  const products = productsFor(db, co.id, db._meta.side);
  return `
    <div class="rounded-lg border border-slate-200 bg-white mb-2 overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 bg-pink-600 text-white">
        <span class="font-semibold text-sm">${co.name}</span>
        ${verifiedBadge(co)} ${claimBadge(co)}
        <span class="text-[11px] text-pink-100">${typeLabel(co.type)} · ${co.region}</span>
        <div class="ml-auto flex items-center gap-2">
          <span class="text-[11px] text-pink-100 underline cursor-default">Go to supplier page</span>
          ${claimBtn(co)} ${connectBtn(db, co)}
        </div>
      </div>
      ${products.length === 0
        ? `<div class="px-4 py-2 text-xs text-slate-400 italic">No ${db._meta.side} listings.</div>`
        : products.map(p => `<div class="flex items-center gap-2 px-6 py-2 border-t border-slate-100 text-sm">
             <span class="text-slate-400 text-xs">${p.category}</span>
             <span>${p.name}</span>
           </div>`).join('')}
    </div>`;
}

// Search-revealed buyers (hidden by default; the Instagram rule made visible).
function revealedBlock(db) {
  const found = searchRevealed(db);
  if (!found.length) return '';
  return `
    <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3 mb-3">
      <div class="text-[11px] font-semibold text-indigo-800 mb-2">🔎 Found by search — not listed publicly (${found.length})</div>
      ${found.map(co => `
        <div class="flex items-center gap-2 px-2 py-1.5 bg-white rounded mb-1">
          <span class="font-semibold text-sm">${co.name}</span>
          <span class="text-xs text-slate-500">${typeLabel(co.type)} · ${co.region}</span>
          <span class="ml-auto">${connectBtn(db, co)}</span>
        </div>`).join('')}
    </div>`;
}

// --- ad / social feed pieces ---------------------------------------------

function campaignCalendar(db) {
  const companies = [...new Set(db.discovery_post.map(p => p.company_id))];
  const cell = (cid, month) => {
    const post = db.discovery_post.find(p => p.company_id === cid && p.campaign_month === month);
    if (!post) return `<td class="border border-slate-700 p-2"></td>`;
    const t = POST_TYPES[post.post_type] || { chip: 'bg-slate-600 text-white' };
    return `<td class="border border-slate-700 p-2"><span class="text-[11px] px-2 py-1 rounded ${t.chip}">${post.headline}</span></td>`;
  };
  return `
    <table class="w-full border-collapse mb-5 text-white">
      <thead><tr>
        <th class="border border-slate-700 p-2 text-left text-pink-400">Campaigns</th>
        ${CAMPAIGN_MONTHS.map(m => `<th class="border border-slate-700 p-2 text-left">${m}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${companies.map(cid => `<tr>
          <td class="border border-slate-700 p-2 font-semibold">${companyName(db, cid)}</td>
          ${CAMPAIGN_MONTHS.map(m => cell(cid, m)).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function adCard(db, post) {
  const t = POST_TYPES[post.post_type] || { label: post.post_type, chip: 'bg-slate-600 text-white' };
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-4 mb-3">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-[10px] px-2 py-0.5 rounded ${t.chip}">${t.label}</span>
        <span class="text-[10px] text-pink-600 font-semibold uppercase">Sponsored · ${typeLabel(post.target_type)}s in ${countryLabel(post.target_country)}</span>
      </div>
      <div class="font-semibold">${post.headline}</div>
      <div class="text-xs text-slate-500 mt-0.5">${companyName(db, post.company_id)} · ${post.campaign_month}</div>
    </div>`;
}

function feedCards(db) {
  return db.discovery_post.map(p => adCard(db, p)).join('');
}

// Compact directory rail (Variant B).
function directoryRail(db) {
  return `
    <div class="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Suppliers</div>
    ${listedCompanies(db).map(co => `
      <div class="flex items-center gap-2 py-2 border-b border-slate-100">
        <div class="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">${co.name[0]}</div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">${co.name}</div>
          <div class="text-[11px] text-slate-400">${typeLabel(co.type)} · ${countryLabel(co.country)}</div>
        </div>
        ${connectBtn(db, co)}
      </div>`).join('')}`;
}

// --- Variant A: Tabs ------------------------------------------------------

export function VariantA(db) {
  const tab = db._meta.tab;
  const tabBtn = (val, label) => `<button data-meta-set="tab" data-val="${val}"
    class="px-4 py-2 text-sm font-medium border-b-2 ${tab === val ? 'border-pink-600 text-pink-600' : 'border-transparent text-slate-500'}">${label}</button>`;

  const directory = () => {
    const byCountry = {};
    for (const co of listedCompanies(db)) (byCountry[co.country] ??= []).push(co);
    return `
      ${searchBar(db)}${revealedBlock(db)}${sideToggle(db)}
      ${Object.keys(byCountry).sort().map(country => `
        <div class="mb-4">
          <div class="text-sm font-bold mb-2">${countryLabel(country)}</div>
          ${byCountry[country].map(co => supplierBlock(db, co)).join('')}
        </div>`).join('')}`;
  };

  const feed = () => `
    <div class="bg-slate-900 rounded-xl p-4 mb-4">${campaignCalendar(db)}</div>
    <div class="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Feed — the B2B social network</div>
    ${feedCards(db)}`;

  return `
    <h1 class="text-xl font-bold mb-1">Discover</h1>
    <p class="text-sm text-slate-500 mb-3">Find suppliers and follow the B2B feed.</p>
    <div class="flex gap-1 border-b border-slate-200 mb-4">${tabBtn('directory', 'Directory')}${tabBtn('feed', 'Feed')}</div>
    ${tab === 'directory' ? directory() : feed()}`;
}

// --- Variant B: Feed-first + directory rail -------------------------------

export function VariantB(db) {
  return `
    <h1 class="text-xl font-bold mb-1">Discover</h1>
    <p class="text-sm text-slate-500 mb-3">The B2B feed up front; suppliers in the rail.</p>
    ${searchBar(db)}
    <div class="grid gap-5" style="grid-template-columns: 1fr 300px;">
      <div>
        <div class="bg-slate-900 rounded-xl p-4 mb-4">${campaignCalendar(db)}</div>
        ${feedCards(db)}
      </div>
      <aside class="border-l border-slate-200 pl-4">
        ${directoryRail(db)}
        ${revealedBlock(db)}
      </aside>
    </div>`;
}

// --- Variant C: Unified feed (directory + ads interleaved) ----------------

export function VariantC(db) {
  // group sellers by company type ("category"), interleave an ad post after each group
  const byType = {};
  for (const co of listedCompanies(db)) (byType[typeLabel(co.type)] ??= []).push(co);
  const groups = Object.keys(byType).sort();
  const posts = db.discovery_post;

  return `
    <h1 class="text-xl font-bold mb-1">Discover</h1>
    <p class="text-sm text-slate-500 mb-3">One feed — suppliers by category, ads woven in.</p>
    ${searchBar(db)}${revealedBlock(db)}${sideToggle(db)}
    ${groups.map((g, i) => `
      <div class="mb-3">
        <div class="text-sm font-bold mb-2">${g}</div>
        ${byType[g].map(co => supplierBlock(db, co)).join('')}
      </div>
      ${posts[i] ? `<div class="my-3">${adCard(db, posts[i])}</div>` : ''}
    `).join('')}`;
}

export const VARIANTS = { A: VariantA, B: VariantB, C: VariantC };
