// Discover prototype — state, render loop, switcher, data panel, actions.
// Throwaway: no tests, no error handling beyond what makes it run.

import { loadDB, saveDB, resetDB, claimProfile, requestConnection } from './db.js';
import { VARIANTS, VARIANT_NAMES } from './variants.js';
import { VIEWER, typeLabel } from './seed.js';

let db = loadDB();

function currentVariant() {
  const v = new URLSearchParams(location.search).get('variant');
  return ['A', 'B', 'C'].includes(v) ? v : 'A';
}
function setVariant(v) {
  const url = new URL(location.href);
  url.searchParams.set('variant', v);
  history.replaceState(null, '', url);
  render();
}

// --- data-state panel -----------------------------------------------------
const PANEL_TABLES = ['company', 'product', 'discovery_post', 'profile_claim', 'connection_request'];

function panelTable(name) {
  const rows = db[name] || [];
  const last = db._meta.lastWrite;
  const recent = rows.slice(-3);
  return `
    <div class="mb-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-700">${name}</span>
        <span class="text-[10px] text-slate-400">${rows.length} row${rows.length === 1 ? '' : 's'}</span>
      </div>
      ${recent.length === 0 ? `<div class="text-[10px] text-slate-300 italic">empty</div>` : ''}
      ${recent.map(r => {
        const hot = last && last.table === name && last.id === r.id;
        const cols = Object.entries(r).filter(([k]) => k !== 'tagline').slice(0, 4)
          .map(([k, v]) => `<span class="text-slate-400">${k}:</span>${typeof v === 'boolean' ? (v ? '✓' : '✗') : v}`).join(' · ');
        return `<div class="text-[10px] font-mono px-1.5 py-1 rounded ${hot ? 'bg-yellow-200' : 'bg-slate-50'} mb-0.5 truncate">${cols}</div>`;
      }).join('')}
    </div>`;
}

function renderPanel() {
  return `<div class="text-xs text-slate-500 mb-2">Viewer: <strong>${VIEWER.name}</strong> (${typeLabel(VIEWER.type)})</div>${PANEL_TABLES.map(panelTable).join('')}`;
}

// --- floating variant switcher --------------------------------------------
function renderSwitcher() {
  const v = currentVariant();
  return `
    <div id="switcher" class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white rounded-full shadow-lg px-3 py-2">
      <button data-switch="prev" class="w-7 h-7 rounded-full hover:bg-slate-700">←</button>
      <span class="text-xs font-medium px-2">${v} — ${VARIANT_NAMES[v]}</span>
      <button data-switch="next" class="w-7 h-7 rounded-full hover:bg-slate-700">→</button>
    </div>`;
}

// --- main render ----------------------------------------------------------
function render() {
  const v = currentVariant();
  document.getElementById('main').innerHTML = VARIANTS[v](db);
  document.getElementById('panel').innerHTML = renderPanel();
  document.getElementById('chrome').innerHTML = renderSwitcher();
}

// --- wiring ---------------------------------------------------------------
document.addEventListener('click', e => {
  const sw = e.target.closest('[data-switch]');
  if (sw) {
    const order = ['A', 'B', 'C'];
    const i = order.indexOf(currentVariant());
    setVariant(sw.dataset.switch === 'next' ? order[(i + 1) % 3] : order[(i + 2) % 3]);
    return;
  }
  // tab / toggle buttons (data-meta-set="tab|side")
  const ms = e.target.closest('[data-meta-set]');
  if (ms) { db._meta[ms.dataset.metaSet] = ms.dataset.val; saveDB(db); render(); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'claim') { claimProfile(db, id); saveDB(db); render(); }
  if (btn.dataset.action === 'connect') { requestConnection(db, id); saveDB(db); render(); }
});

// search box (data-meta="q") — live, preserves focus by not re-rendering the input itself
document.addEventListener('input', e => {
  const m = e.target.closest('[data-meta]');
  if (!m) return;
  db._meta[m.dataset.meta] = m.value;
  saveDB(db);
  render();
  // restore focus + caret to the search field after re-render
  const fresh = document.querySelector(`[data-meta="${m.dataset.meta}"]`);
  if (fresh) { fresh.focus(); fresh.setSelectionRange(m.value.length, m.value.length); }
});

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const order = ['A', 'B', 'C'];
  const i = order.indexOf(currentVariant());
  setVariant(e.key === 'ArrowRight' ? order[(i + 1) % 3] : order[(i + 2) % 3]);
});

document.getElementById('reset-btn').addEventListener('click', () => { resetDB(); db = loadDB(); render(); });
document.getElementById('toggle-panel-btn').addEventListener('click', () => {
  document.getElementById('panel-col').classList.toggle('hidden');
});

render();
