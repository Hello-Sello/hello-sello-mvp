// Main controller. State machine for: full-page screens + modal sequence + home + re-opened modals.

import {
  freshDB, loadDB, saveDB, resetDB, nextId,
  AUTH_SCREENS_LIST, DARK_SCREENS, ONBOARDING_SEQUENCE, SETUP_TILES
} from './db.js';

import { DEFAULT_GROUPS, isDefaultPermission, PERMISSION_ACTIONS, SAMPLE_CONTACTS } from './seed.js';
import * as Screens from './screens.js';

// ---------- state ----------

const state = {
  screen: 'signup',            // 'signup' | 'email-verify' | 'signin' | 'company-setup' | 'home'
  modal: null,                 // null | 'submission-dialog' | 'welcome' | 'gmail' | 'profile' | 'company-details' | 'team'
  modalMode: null,             // null | 'sequence' | 'reopen'
  selectedFile: null,          // File object for company license upload
  db: loadDB(),
  recentlyAdded: {}
};

// Restore screen + modal based on DB state on reload
function restore() {
  const d = state.db;
  if (d._meta?.signed_in && d.company[0]) {
    state.screen = 'home';
    state.modal = null;
    state.modalMode = null;
    return;
  }
  if (d._meta?.signed_in) {
    state.screen = 'company-setup';
    return;
  }
  if (d.person[0]?.email_verified) {
    state.screen = 'signin';
    return;
  }
  if (d.person.length > 0) {
    state.screen = 'email-verify';
    return;
  }
  state.screen = 'signup';
}
restore();

// ---------- render ----------

function render() {
  renderHeader();
  renderShell();
  renderScreenRoot();
  renderModal();
  renderDataPanel();
}

function renderHeader() {
  // Show signed-in top bar only when fully on home (no active onboarding modal).
  // During the modal sequence we want a clean focus on the dialog itself.
  const topbar = document.getElementById('app-topbar');
  const progress = document.getElementById('flow-progress');

  const onHomeNotInSequence = state.screen === 'home' && state.modalMode !== 'sequence';

  if (onHomeNotInSequence) {
    topbar.classList.remove('hidden');
    const p = state.db.person[0];
    const c = state.db.company[0];
    const name = p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : '';
    document.getElementById('app-current-user').textContent = name;
    document.getElementById('app-current-company').textContent = c ? '@ ' + c.name : '';
  } else {
    topbar.classList.add('hidden');
  }
  progress.classList.add('hidden');
}

function renderShell() {
  const shell = document.getElementById('app-shell');
  const isDark = DARK_SCREENS.includes(state.screen);
  if (isDark) {
    shell.classList.add('bg-slate-950', 'border-slate-800');
    shell.classList.remove('bg-white', 'border-slate-200');
  } else {
    shell.classList.add('bg-white', 'border-slate-200');
    shell.classList.remove('bg-slate-950', 'border-slate-800');
  }
}

function renderScreenRoot() {
  const root = document.getElementById('screen-root');
  switch (state.screen) {
    case 'signup': root.innerHTML = Screens.renderSignup(state); break;
    case 'email-verify': root.innerHTML = Screens.renderEmailVerify(state); break;
    case 'signin': root.innerHTML = Screens.renderSignin(state); break;
    case 'company-setup': root.innerHTML = Screens.renderCompanySetup(state); break;
    case 'home':
      // While an onboarding-sequence modal is active, hide the home behind a clean
      // background so the user focuses only on the active dialog. Re-opened modals
      // (clicked from the home checklist) keep the home visible behind them.
      if (state.modalMode === 'sequence') {
        root.innerHTML = `<div class="-m-6">${Screens.renderOnboardingBackground(state)}</div>`;
      } else {
        root.innerHTML = `<div class="-m-6">${Screens.renderHome(state)}</div>`;
      }
      break;
    default: root.innerHTML = `<p>Unknown screen: ${state.screen}</p>`;
  }
}

function renderModal() {
  document.querySelectorAll('[data-modal-root]').forEach(el => el.remove());
  if (!state.modal) return;
  const div = document.createElement('div');
  div.setAttribute('data-modal-root', '');
  let html = '';
  switch (state.modal) {
    case 'submission-dialog': html = Screens.renderSubmissionDialog(state); break;
    case 'welcome': html = Screens.renderWelcomeModal(state); break;
    case 'gmail': html = Screens.renderGmailModal(state); break;
    case 'profile': html = Screens.renderProfileModal(state); break;
    case 'company-details': html = Screens.renderCompanyDetailsModal(state); break;
    case 'team': html = Screens.renderTeamModal(state); break;
  }
  div.innerHTML = html;
  document.body.appendChild(div);
}

function renderDataPanel() {
  const tables = ['person', 'company', 'group', 'person_group', 'permission_matrix_entry', 'contact_record', 'pending_inbox_item'];
  const container = document.getElementById('data-tables');
  container.innerHTML = tables.map(t => renderTableBlock(t, state.db[t] || [])).join('') + renderMetaBlock();
}

function renderMetaBlock() {
  const meta = state.db._meta || {};
  const items = [
    `signed_in: ${meta.signed_in}`,
    `verified: ${meta.verified}`,
    `setup_status: ${JSON.stringify(meta.setup_status || {})}`
  ];
  return `
    <details open>
      <summary class="cursor-pointer font-medium text-slate-700 select-none py-1"><code>_meta</code></summary>
      <div class="mt-1 space-y-1 pl-3">
        <div class="p-2 bg-indigo-50 rounded text-[10.5px] font-mono leading-snug">
          ${items.map(i => `<div>${i}</div>`).join('')}
        </div>
      </div>
    </details>
  `;
}

function renderTableBlock(name, rows) {
  if (rows.length === 0) {
    return `<details><summary class="cursor-pointer text-slate-400 select-none py-1"><code>${name}</code> <span class="text-[10px]">· empty</span></summary></details>`;
  }
  const recent = state.recentlyAdded[name] || [];
  return `
    <details open>
      <summary class="cursor-pointer font-medium text-slate-700 select-none py-1"><code>${name}</code> <span class="text-[10px] text-slate-500">· ${rows.length} row${rows.length > 1 ? 's' : ''}</span></summary>
      <div class="mt-1 space-y-1 pl-3">
        ${rows.map(r => `
          <div class="p-2 bg-slate-50 rounded text-[10.5px] font-mono leading-snug ${recent.includes(r.id) ? 'data-row-new' : ''}">
            ${formatRow(r)}
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function formatRow(r) {
  return Object.entries(r)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => {
      let val;
      if (v === null) val = '<span class="text-slate-400">null</span>';
      else if (typeof v === 'object') val = JSON.stringify(v);
      else val = String(v);
      if (typeof val === 'string' && val.length > 60) val = val.slice(0, 57) + '…';
      return `<div><span class="text-slate-500">${k}:</span> ${val}</div>`;
    }).join('');
}

// ---------- helpers ----------

function commit() {
  saveDB(state.db);
  render();
  setTimeout(() => { state.recentlyAdded = {}; }, 100);
}

function markNew(table, id) {
  (state.recentlyAdded[table] ||= []).push(id);
}

function advanceSequence() {
  // Advance modal within onboarding sequence (or end it)
  const idx = ONBOARDING_SEQUENCE.indexOf(state.modal);
  const next = ONBOARDING_SEQUENCE[idx + 1] || null;
  state.modal = next;
  if (!next) state.modalMode = null;
}

function closeModal() {
  if (state.modalMode === 'sequence') {
    advanceSequence();
  } else {
    state.modal = null;
    state.modalMode = null;
  }
}

function markStatus(tile, status) {
  if (!state.db._meta.setup_status) state.db._meta.setup_status = {};
  state.db._meta.setup_status[tile] = status;
}

// ---------- action handlers ----------

const actions = {
  // ---------- auth flow ----------
  signup: (e, fd) => {
    if (fd.get('password') !== fd.get('password_confirm')) {
      alert("Passwords don't match");
      return;
    }
    if (state.db.person.length === 0) {
      const pid = nextId(state.db);
      state.db.person.push({
        id: pid,
        first_name: fd.get('first_name'),
        last_name: fd.get('last_name'),
        email: fd.get('email'),
        password_set: true,
        email_verified: false,
        verified_at: null,
        company_id: null,
        is_superadmin: false,
        preferences: {},
        created_at: new Date().toISOString()
      });
      state.db._meta.current_person_id = pid;
      markNew('person', pid);
    }
    state.screen = 'email-verify';
    commit();
  },

  'verify-email': () => {
    const p = state.db.person[0];
    if (p) {
      p.email_verified = true;
      p.verified_at = new Date().toISOString();
    }
    state.screen = 'signin';
    commit();
  },

  signin: () => {
    state.db._meta.signed_in = true;
    state.screen = 'company-setup';
    commit();
  },

  // ---------- company setup ----------
  'select-license-file': (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (file) {
      // Stash a serializable copy on state — File objects aren't directly serializable
      // but we just keep the metadata + the actual File in memory.
      state.selectedFile = { name: file.name, size: file.size, type: file.type };
      render();
    }
  },

  'clear-license-file': () => {
    state.selectedFile = null;
    render();
  },

  'create-company': (e, fd) => {
    if (state.db.company.length === 0) {
      const cid = nextId(state.db);
      const company = {
        id: cid,
        name: fd.get('company_name'),
        country: fd.get('country') || 'DE',
        license_filename: state.selectedFile?.name || null,
        verification_status: state.selectedFile ? 'pending' : null,
        created_at: new Date().toISOString()
      };
      state.db.company.push(company);
      state.db._meta.current_company_id = cid;

      const p = state.db.person[0];
      if (p) {
        p.company_id = cid;
        p.is_superadmin = true;
        const pgId = nextId(state.db);
        state.db.person_group.push({
          id: pgId, person_id: p.id, group_id: null, role: 'superadmin'
        });
        markNew('person_group', pgId);
      }
      markNew('company', cid);
    }
    // Transition to home with submission dialog starting the modal sequence
    state.screen = 'home';
    state.modal = 'submission-dialog';
    state.modalMode = 'sequence';
    state.selectedFile = null;
    commit();
  },

  // ---------- modal sequence (generic) ----------
  'next-modal': () => {
    closeModal();
    commit();
  },

  'skip-modal': () => {
    // Mark current tile as skipped (if it's a setup tile)
    if (SETUP_TILES.includes(state.modal)) {
      markStatus(state.modal, 'skipped');
    }
    closeModal();
    commit();
  },

  // ---------- gmail modal action ----------
  'connect-gmail': (e) => {
    // Simulate import
    if (state.db.contact_record.length === 0) {
      SAMPLE_CONTACTS.forEach(c => {
        const id = nextId(state.db);
        state.db.contact_record.push({
          id, person_id: state.db._meta.current_person_id,
          ...c, role: suggestRole(c)
        });
        markNew('contact_record', id);
      });
    }
    markStatus('gmail', 'done');
    closeModal();
    commit();
  },

  // ---------- profile modal action ----------
  'save-profile': (e, fd) => {
    const p = state.db.person[0];
    if (p) {
      p.preferences = {
        ...(p.preferences || {}),
        title: fd.get('title'),
        phone: fd.get('phone'),
        language: fd.get('language')
      };
    }
    markStatus('profile', 'done');
    closeModal();
    commit();
  },

  // ---------- company details modal action ----------
  'save-company-details': (e, fd) => {
    const c = state.db.company[0];
    if (c) {
      c.address = fd.get('address');
      c.description = fd.get('description');
      c.primary_products = fd.get('primary_products');
      c.website = fd.get('website');
    }
    markStatus('company-details', 'done');
    closeModal();
    commit();
  },

  // ---------- team modal action ----------
  'save-team': (e, fd) => {
    const selectedGroups = [];
    if (fd.get('group_sales')) selectedGroups.push('Sales Team');
    if (fd.get('group_procurement')) selectedGroups.push('Procurement Team');
    if (fd.get('group_compliance')) selectedGroups.push('Compliance / QA');
    if (fd.get('group_approver')) selectedGroups.push('Approver');

    selectedGroups.forEach(name => {
      if (state.db.group.some(g => g.name === name)) return;
      const meta = DEFAULT_GROUPS.find(g => g.name === name);
      const gid = nextId(state.db);
      state.db.group.push({
        id: gid,
        company_id: state.db._meta.current_company_id,
        name,
        description: meta?.description || ''
      });
      markNew('group', gid);

      // Auto-apply default permissions
      PERMISSION_ACTIONS.forEach(action => {
        if (!isDefaultPermission(action, name)) return;
        const pid = nextId(state.db);
        state.db.permission_matrix_entry.push({
          id: pid, group_id: gid, action, granted: true
        });
        markNew('permission_matrix_entry', pid);
      });
    });

    markStatus('team', 'done');
    closeModal();
    commit();
  },

  // ---------- home page actions ----------
  'open-tile': (e) => {
    const tile = e.target.closest('[data-action="open-tile"]').dataset.tile;
    state.modal = tile;
    state.modalMode = 'reopen';
    render();
  },

  'dismiss-checklist': () => {
    state.db._meta.checklist_dismissed = true;
    commit();
  },

  'simulate-verify': () => {
    state.db._meta.verified = true;
    const c = state.db.company[0];
    if (c) c.verification_status = 'verified';
    commit();
  },

  'close-modal': () => {
    closeModal();
    commit();
  }
};

function suggestRole(c) {
  if (/apo|pharm/.test(c.email)) return 'customer';
  if (/aurora|tilray|cologne/.test(c.email)) return 'supplier';
  return 'unknown';
}

// ---------- event delegation ----------

document.addEventListener('click', (e) => {
  // Modal backdrop click → close (only when modal is in 'reopen' mode; sequence must be acted on)
  const backdrop = e.target.closest('[data-modal-backdrop]');
  if (backdrop && !e.target.closest('[data-modal-card]')) {
    if (state.modalMode === 'reopen') {
      actions['close-modal'](e);
    }
    return;
  }

  const target = e.target.closest('[data-action]');
  if (!target) return;

  // Clicks inside a form that has data-action — let submit handler take over
  if (target.tagName === 'FORM') return;

  const action = target.dataset.action;
  if (actions[action]) {
    e.preventDefault();
    actions[action](e);
  }
});

// File input change listener — fired when user picks a file
document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  // Only handle file inputs here; forms still use submit
  if (target.tagName === 'INPUT' && target.type === 'file' && actions[action]) {
    actions[action](e);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const action = form.dataset.action;
  if (!action || !actions[action]) return;
  e.preventDefault();
  actions[action](e, new FormData(form));
});

// Reset button
document.getElementById('reset-btn').addEventListener('click', () => {
  state.db = freshDB();
  state.screen = 'signup';
  state.modal = null;
  state.modalMode = null;
  state.selectedFile = null;
  resetDB();
  saveDB(state.db);
  render();
});

// Toggle data panel
document.getElementById('toggle-panel-btn').addEventListener('click', () => {
  const panel = document.getElementById('data-panel');
  const main = document.querySelector('main');
  panel.classList.toggle('hidden');
  main.style.gridTemplateColumns = panel.classList.contains('hidden') ? '1fr' : '1fr 380px';
});

// Initial render
render();
