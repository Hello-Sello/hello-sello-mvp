// Render functions. Three categories:
//  1. Auth screens — full-page dark theme (signup, email-verify, signin)
//  2. Company setup — full-page light theme with dropzone upload
//  3. Home page + modal overlays — light theme, modals as dialogs

import { SETUP_TILES } from './db.js';
import { COMPANY_TYPES } from './seed.js';

// ---------- helpers ----------

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function authShell(innerHTML, footerNote) {
  return `
    <div class="-m-6 min-h-[560px] bg-black flex flex-col">
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="w-full max-w-md">
          ${logoMark()}
          ${innerHTML}
        </div>
      </div>
      ${footerNote ? `
        <div class="bg-slate-950 border-t border-slate-800 px-6 py-3 text-xs text-slate-400">
          <strong class="text-slate-300">Mock DB writes:</strong> ${footerNote}
        </div>
      ` : ''}
    </div>
  `;
}

function logoMark() {
  return `
    <div class="flex justify-center mb-6">
      <div class="w-20 h-20 bg-black border border-slate-800 rounded-2xl flex items-center justify-center">
        <div class="text-center leading-tight">
          <div class="text-pink-500 font-black text-base">Hello</div>
          <div class="text-pink-500 font-black text-base">sello</div>
        </div>
      </div>
    </div>
  `;
}

function dbNote(text) {
  return `
    <div class="mt-6 text-xs text-slate-500 border-t border-slate-100 pt-3">
      <strong class="text-slate-700">What this writes to the mock DB:</strong> ${text}
    </div>
  `;
}

const darkInputCls = 'w-full mt-1 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded text-white text-sm focus:border-pink-500 focus:outline-none placeholder:text-slate-600';

// =====================================================================
// AUTH SCREENS (dark)
// =====================================================================

export function renderSignup(state) {
  const inner = `
    <h1 class="text-white text-lg font-bold text-center mb-6 tracking-wider">CREATE YOUR HELLO SELLO ACCOUNT</h1>

    <div class="space-y-2.5 mb-6">
      <div class="flex items-center gap-3">
        <div class="w-6 h-6 bg-pink-600 rounded flex items-center justify-center text-white text-xs font-bold">✓</div>
        <span class="text-pink-500 text-sm font-medium">Register to get a QR code business card</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="w-6 h-6 bg-pink-600 rounded flex items-center justify-center text-white text-xs font-bold">✓</div>
        <span class="text-pink-500 text-sm font-medium">Enter a network to buy and sell B2B</span>
      </div>
    </div>

    <form data-action="signup" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs text-slate-400">First Name</span>
          <input name="first_name" type="text" required value="Sarah" class="${darkInputCls}" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-400">Last Name</span>
          <input name="last_name" type="text" required value="Kim" class="${darkInputCls}" />
        </label>
      </div>
      <label class="block">
        <span class="text-xs text-slate-400">Email Address</span>
        <input name="email" type="email" required placeholder="you@company.com" value="sarah@aurora.ca" class="${darkInputCls}" />
      </label>
      <label class="block">
        <span class="text-xs text-slate-400">Password</span>
        <input name="password" type="password" required minlength="8" value="password123" class="${darkInputCls}" />
        <span class="block mt-1 text-[10px] text-slate-500">Minimum 8 characters</span>
      </label>
      <label class="block">
        <span class="text-xs text-slate-400">Confirm Password</span>
        <input name="password_confirm" type="password" required minlength="8" value="password123" class="${darkInputCls}" />
      </label>
      <button type="submit" class="w-full py-3 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 mt-2">
        Create Account
      </button>
      <p class="text-center text-xs text-slate-500 mt-4">
        Already have an account? <span class="text-indigo-400 cursor-pointer hover:text-indigo-300">Sign in</span>
      </p>
    </form>
  `;
  return authShell(inner, 'Creates one <code class="bg-slate-800 text-slate-300">person</code> row with <code class="bg-slate-800 text-slate-300">email_verified: false</code>.');
}

export function renderEmailVerify(state) {
  const email = state.db.person[0]?.email || 'your@email.com';
  const inner = `
    <h1 class="text-white text-lg font-bold text-center mb-4 tracking-wider">CHECK YOUR EMAIL</h1>
    <div class="text-center mb-6">
      <div class="text-5xl mb-4">📧</div>
      <p class="text-slate-400 text-sm mb-2">We sent a verification link to:</p>
      <p class="text-pink-500 font-medium">${escapeHtml(email)}</p>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded p-3 text-xs text-slate-400 mb-6">
      <strong class="text-slate-300">Prototype note:</strong> No real email is sent. Click below to simulate clicking the verification link.
    </div>
    <form data-action="verify-email" class="space-y-3">
      <button type="submit" class="w-full py-3 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700">
        I've verified my email
      </button>
      <p class="text-center text-xs text-slate-500">
        Didn't receive it? <span class="text-indigo-400 cursor-pointer hover:text-indigo-300">Resend</span>
      </p>
    </form>
  `;
  return authShell(inner, 'Updates <code class="bg-slate-800 text-slate-300">person.email_verified: true</code>, sets <code class="bg-slate-800 text-slate-300">verified_at</code>.');
}

export function renderSignin(state) {
  const email = state.db.person[0]?.email || '';
  const inner = `
    <h1 class="text-white text-lg font-bold text-center mb-6 tracking-wider">WELCOME BACK</h1>
    <p class="text-slate-400 text-sm text-center mb-6">Sign in to start using Hello Sello.</p>
    <form data-action="signin" class="space-y-4">
      <label class="block">
        <span class="text-xs text-slate-400">Email Address</span>
        <input name="email" type="email" required value="${escapeHtml(email)}" class="${darkInputCls}" />
      </label>
      <label class="block">
        <span class="text-xs text-slate-400">Password</span>
        <input name="password" type="password" required minlength="8" value="password123" class="${darkInputCls}" />
      </label>
      <div class="flex justify-end">
        <span class="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300">Forgot password?</span>
      </div>
      <button type="submit" class="w-full py-3 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700">
        Sign in
      </button>
    </form>
  `;
  return authShell(inner, 'No DB row created — sets <code class="bg-slate-800 text-slate-300">_meta.signed_in: true</code>.');
}

// =====================================================================
// COMPANY SETUP — full-page light theme with dropzone
// =====================================================================

export function renderCompanySetup(state) {
  const file = state.selectedFile;
  const defaultType = 'cultivator';
  const defaultLabel = COMPANY_TYPES.find(t => t.code === defaultType)?.description || 'Select business categories';
  return `
    <div class="max-w-md mx-auto">
      <h2 class="text-2xl font-semibold mb-2">Set up your company</h2>
      <p class="text-sm text-slate-500 mb-6">
        You're the first user from your company. You'll be the <strong>Superadmin</strong> — you can add others and assign roles later.
      </p>

      <form data-action="create-company" class="space-y-4">
        <label class="block">
          <span class="text-sm text-slate-700">Company name</span>
          <input name="company_name" type="text" required value="Aurora Cannabis"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-pink-300 focus:outline-none" />
        </label>

        <label class="block">
          <span class="text-sm text-slate-700">Country</span>
          <select name="country" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded">
            <option value="DE" selected>Germany</option>
            <option value="CA">Canada</option>
            <option value="NL">Netherlands</option>
            <option value="CH">Switzerland</option>
            <option value="AT">Austria</option>
          </select>
        </label>

        <div>
          <span class="text-sm text-slate-700 block mb-1">Business category <span class="text-slate-400 font-normal">(select all that apply)</span></span>
          <details class="group" data-category-dropdown>
            <summary class="flex items-center justify-between px-3 py-2 border border-slate-300 rounded cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:border-pink-400">
              <span data-category-summary class="text-sm text-slate-700 truncate flex-1 min-w-0">${escapeHtml(defaultLabel)}</span>
              <span class="text-slate-400 text-xs ml-2 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div class="mt-1 border border-slate-200 rounded bg-white p-1">
              ${COMPANY_TYPES.map(t => `
                <label class="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 has-[:checked]:bg-pink-50">
                  <input type="checkbox" name="company_type" value="${t.code}" ${t.code === defaultType ? 'checked' : ''} class="accent-pink-600" />
                  <span class="text-sm text-slate-700">${escapeHtml(t.description)}</span>
                </label>
              `).join('')}
            </div>
          </details>
          <div class="text-xs text-slate-500 mt-2">What your business is — not who you buy from or sell to. A company can be several (e.g. cultivator + importer).</div>
        </div>

        <div>
          <span class="text-sm text-slate-700 block mb-1">License / certificate <span class="text-slate-400 font-normal">(optional)</span></span>
          ${file
            ? `<div class="border border-emerald-200 bg-emerald-50 rounded-lg p-3 flex items-center gap-3">
                 <span class="text-2xl">📄</span>
                 <div class="flex-1 min-w-0">
                   <div class="text-sm font-medium text-emerald-800 truncate">${escapeHtml(file.name)}</div>
                   <div class="text-xs text-emerald-600">${(file.size / 1024).toFixed(1)} KB · ready to submit</div>
                 </div>
                 <button type="button" data-action="clear-license-file" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
               </div>`
            : `<label class="block border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-pink-400 hover:bg-slate-50 transition-colors">
                 <input data-action="select-license-file" name="license_file" type="file" accept="application/pdf,image/*" class="hidden" />
                 <div class="text-3xl mb-1">☁️</div>
                 <div class="text-sm font-medium text-slate-700">Click to upload</div>
                 <div class="text-xs text-slate-500">or drag and drop</div>
                 <div class="text-[11px] text-slate-400 mt-2">PDF, PNG, or JPG · up to 10 MB</div>
               </label>`
          }
          <div class="text-xs text-slate-500 mt-2">Upload your business license or trade certificate so our team can verify your company.</div>
        </div>

        <div class="flex justify-end pt-2">
          <button type="submit" class="px-5 py-2 bg-pink-600 text-white rounded hover:bg-pink-700">
            Create company →
          </button>
        </div>
      </form>
      ${dbNote('Creates a <code>company</code> row · links <code>person.company_id</code> · inserts <code>person_group</code> as Superadmin · inserts a <code>company_type_assignment</code> row per selected category · stores <code>license_filename</code> + sets <code>verification_status: \'pending\'</code>.')}
    </div>
  `;
}

// =====================================================================
// HOME PAGE — background of all modals after company-setup
// =====================================================================

export function renderHome(state) {
  const verified = state.db._meta?.verified;
  const dismissed = state.db._meta?.checklist_dismissed;
  const status = state.db._meta?.setup_status || {};
  const doneCount = SETUP_TILES.filter(t => status[t] === 'done').length;
  const total = SETUP_TILES.length;

  return `
    <div class="bg-white">
      ${!dismissed ? renderChecklist(status, doneCount, total) : ''}
      ${renderVerificationBanner(verified)}
      <div class="p-12 text-center text-slate-400">
        <div class="text-5xl mb-4">💬</div>
        <h2 class="text-lg font-medium text-slate-600 mb-1">Home view</h2>
        <p class="text-sm">The Sella chat home ("Hello Sarah, what are we doing next?") lives here.</p>
        <p class="text-xs mt-2 text-slate-400">Your teammate is designing this — out of scope for Phase 1.</p>
      </div>
    </div>
  `;
}

// Clean background shown behind modals while the onboarding sequence is running.
// Replaces the home view so the user focuses only on the active dialog.
export function renderOnboardingBackground(state) {
  return `
    <div class="bg-white min-h-[560px] flex items-start justify-center p-8">
      <div class="text-center mt-4">
        <div class="text-pink-600 font-black text-2xl tracking-tight mb-1">Hello sello</div>
        <div class="text-xs text-slate-400 uppercase tracking-wide">Setting up your account…</div>
      </div>
    </div>
  `;
}

function renderChecklist(status, doneCount, total) {
  const tileMeta = {
    'gmail': { icon: '📧', title: 'Connect Gmail', sub: 'Find people you know' },
    'profile': { icon: '👤', title: 'Profile', sub: 'For your QR card' },
    'company-details': { icon: '🏢', title: 'Company details', sub: 'For your QR card' },
    'team': { icon: '👥', title: 'Team', sub: 'Groups + Permissions' }
  };

  return `
    <div class="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-6 py-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-slate-500 uppercase tracking-wide">Welcome to Hello Sello</div>
          <div class="text-sm font-medium text-slate-700 mt-0.5">Finish setting up your account</div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            ${SETUP_TILES.map(t => `
              <div class="w-4 h-4 rounded border ${status[t] === 'done' ? 'bg-pink-600 border-pink-600' : 'bg-white border-slate-300'} flex items-center justify-center">
                ${status[t] === 'done' ? '<span class="text-white text-[10px] leading-none">✓</span>' : ''}
              </div>
            `).join('')}
            <span class="ml-2 text-xs text-slate-600 font-medium">${doneCount}/${total}</span>
          </div>
          <button data-action="dismiss-checklist" class="text-slate-400 hover:text-slate-700 text-lg leading-none ml-2">×</button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3">
        ${SETUP_TILES.map(t => {
          const m = tileMeta[t];
          const isDone = status[t] === 'done';
          return `
            <button data-action="open-tile" data-tile="${t}"
              class="text-left p-3 rounded-lg border ${isDone ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-pink-300 hover:shadow-sm'} transition-all relative">
              ${isDone ? '<div class="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs">✓</div>' : ''}
              <div class="text-xl mb-1">${m.icon}</div>
              <div class="text-sm font-medium ${isDone ? 'text-emerald-800' : 'text-slate-800'}">${m.title}</div>
              <div class="text-[11px] ${isDone ? 'text-emerald-600' : 'text-slate-500'} mt-0.5">${m.sub}</div>
              <div class="mt-2 flex items-center gap-1 text-[11px] ${isDone ? 'text-emerald-700' : 'text-pink-600'}">
                ${isDone ? 'Done' : 'Set up'} <span>↗</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderVerificationBanner(verified) {
  if (verified) {
    return `
      <div class="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-emerald-600 text-lg">✓</span>
          <span class="text-sm text-emerald-900"><strong>Verified.</strong> Discover and Connect are now unlocked.</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-amber-600">⏳</span>
        <span class="text-sm text-amber-900"><strong>Verification pending</strong> · Your company is being reviewed. Some features will unlock once verification is complete.</span>
      </div>
      <button data-action="simulate-verify" class="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700">
        Dev: simulate verification
      </button>
    </div>
  `;
}

// =====================================================================
// MODALS — overlays on top of home
// =====================================================================

function modalShell(innerHTML, opts = {}) {
  const wide = opts.wide ? 'max-w-lg' : 'max-w-md';
  return `
    <div class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" data-modal-backdrop>
      <div class="bg-white rounded-xl shadow-2xl ${wide} w-full" data-modal-card>
        ${innerHTML}
      </div>
    </div>
  `;
}

export function renderSubmissionDialog(state) {
  return modalShell(`
    <div class="p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center text-3xl">✓</div>
      <h3 class="text-lg font-semibold mb-2">Application submitted</h3>
      <p class="text-sm text-slate-600 mb-4">
        We've received your company information. The Hello Sello team will verify your account within <strong>12 hours</strong>. You'll receive an email confirmation once verification is complete.
      </p>
      <p class="text-xs text-slate-500 mb-6">In the meantime, finish setting up your account.</p>
      <button data-action="next-modal" class="w-full py-2.5 bg-pink-600 text-white rounded font-medium hover:bg-pink-700">
        Continue
      </button>
    </div>
  `);
}

export function renderWelcomeModal(state) {
  const name = state.db.person[0]?.first_name || 'there';
  return modalShell(`
    <div class="p-6 text-center">
      <div class="text-5xl mb-4">🎉</div>
      <h3 class="text-xl font-semibold mb-2">Welcome to Hello Sello, ${escapeHtml(name)}</h3>
      <p class="text-sm text-slate-600 mb-6">
        You're all set. While your company is being verified, you can explore the platform
        and finish any setup steps you skipped from the home checklist.
      </p>
      <button data-action="next-modal" class="w-full py-2.5 bg-pink-600 text-white rounded font-medium hover:bg-pink-700">
        Enter Hello Sello →
      </button>
    </div>
  `);
}

export function renderGmailModal(state) {
  return modalShell(`
    <div class="p-6">
      <div class="text-center mb-4">
        <div class="text-4xl mb-2">📧</div>
        <h3 class="text-lg font-semibold">Connect your email</h3>
        <p class="text-sm text-slate-600 mt-1">Find people you already know on Hello Sello.</p>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 mb-4">
        <strong>GDPR-safe:</strong> Metadata only — no subject lines, no email bodies, no third-party enrichment.
      </div>
      <div class="space-y-2 mb-4">
        <button data-action="connect-gmail" data-provider="gmail"
          class="w-full p-3 border border-slate-300 rounded hover:bg-slate-50 text-left flex items-center gap-3">
          <span class="text-xl">📧</span>
          <span class="text-sm font-medium">Connect Gmail</span>
        </button>
        <button data-action="connect-gmail" data-provider="outlook"
          class="w-full p-3 border border-slate-300 rounded hover:bg-slate-50 text-left flex items-center gap-3">
          <span class="text-xl">📨</span>
          <span class="text-sm font-medium">Connect Outlook</span>
        </button>
      </div>
      <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button data-action="skip-modal" class="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Skip for now</button>
      </div>
    </div>
  `);
}

export function renderProfileModal(state) {
  const p = state.db.person[0] || {};
  const displayName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : '';
  return modalShell(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-1">Complete your profile</h3>
      <p class="text-sm text-slate-600 mb-4">For your QR business card and how you show up across the platform.</p>
      <form data-action="save-profile" class="space-y-3">
        <label class="block">
          <span class="text-xs text-slate-600">Display name</span>
          <input name="display_name" type="text" required value="${escapeHtml(displayName)}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Title / role</span>
          <input name="title" type="text" value="${escapeHtml(p.preferences?.title || 'Sales Manager')}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Phone</span>
          <input name="phone" type="tel" placeholder="+49 ..." value="${escapeHtml(p.preferences?.phone || '')}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Language</span>
          <select name="language" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm">
            <option value="en" ${p.preferences?.language === 'en' ? 'selected' : ''}>English</option>
            <option value="de" ${p.preferences?.language === 'de' ? 'selected' : ''}>Deutsch</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" data-action="skip-modal" class="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Skip</button>
          <button type="submit" class="px-4 py-2 text-sm bg-pink-600 text-white rounded hover:bg-pink-700">Save</button>
        </div>
      </form>
    </div>
  `);
}

export function renderCompanyDetailsModal(state) {
  const c = state.db.company[0] || {};
  return modalShell(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-1">Add company details</h3>
      <p class="text-sm text-slate-600 mb-4">Extra info for your QR business card. All optional.</p>
      <form data-action="save-company-details" class="space-y-3">
        <label class="block">
          <span class="text-xs text-slate-600">Street address</span>
          <input name="address" type="text" placeholder="e.g., Kurfürstendamm 21, Berlin"
            value="${escapeHtml(c.address || '')}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Description</span>
          <textarea name="description" rows="2" placeholder="A short blurb about your company..."
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm">${escapeHtml(c.description || '')}</textarea>
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Primary products</span>
          <input name="primary_products" type="text" placeholder="e.g., Medical cannabis flower, oils"
            value="${escapeHtml(c.primary_products || '')}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <label class="block">
          <span class="text-xs text-slate-600">Website</span>
          <input name="website" type="url" placeholder="https://..."
            value="${escapeHtml(c.website || '')}"
            class="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" />
        </label>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" data-action="skip-modal" class="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Skip</button>
          <button type="submit" class="px-4 py-2 text-sm bg-pink-600 text-white rounded hover:bg-pink-700">Save</button>
        </div>
      </form>
    </div>
  `);
}

export function renderTeamModal(state) {
  return modalShell(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-1">Set up your team</h3>
      <p class="text-sm text-slate-600 mb-4">Pick the Groups you need. Custom Groups + invitations come later.</p>
      <form data-action="save-team" class="space-y-2">
        <label class="flex items-start gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="group_sales" checked class="mt-1" />
          <div>
            <div class="text-sm font-medium">Sales Team</div>
            <div class="text-xs text-slate-500">Outbound offers + customer relationships</div>
          </div>
        </label>
        <label class="flex items-start gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="group_procurement" checked class="mt-1" />
          <div>
            <div class="text-sm font-medium">Procurement Team</div>
            <div class="text-xs text-slate-500">Inventory sourcing + supplier deals</div>
          </div>
        </label>
        <label class="flex items-start gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="group_compliance" class="mt-1" />
          <div>
            <div class="text-sm font-medium">Compliance / QA</div>
            <div class="text-xs text-slate-500">Cannabis regulatory + quality assurance</div>
          </div>
        </label>
        <label class="flex items-start gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="group_approver" checked class="mt-1" />
          <div>
            <div class="text-sm font-medium">Approver</div>
            <div class="text-xs text-slate-500">Pricelist sign-off + sensitive actions</div>
          </div>
        </label>
        <div class="text-xs text-slate-400 pt-1">Permissions auto-default to sensible values per Group. Customize from Settings later.</div>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <button type="button" data-action="skip-modal" class="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Skip</button>
          <button type="submit" class="px-4 py-2 text-sm bg-pink-600 text-white rounded hover:bg-pink-700">Save</button>
        </div>
      </form>
    </div>
  `);
}
