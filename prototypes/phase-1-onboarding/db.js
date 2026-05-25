// Mock DB + flow state model.
// Auth screens (signup → email-verify → signin → company-setup) are full-page.
// After company submit, lands on HOME with a sequential modal onboarding flow.

const STORAGE_KEY = 'hellosello-phase1-db';

// Full-page screens (in order). Beyond this, user is on HOME.
export const AUTH_SCREENS_LIST = ['signup', 'email-verify', 'signin', 'company-setup'];

// Screens that use the dark theme.
export const DARK_SCREENS = ['signup', 'email-verify', 'signin'];

// Modals shown sequentially after company submit. User can Continue/Skip each.
// 'submission-dialog' = info confirmation that the application was submitted.
// Then the 4 setup prompts (each skippable).
// 'welcome' comes LAST as a celebratory arrival before the user sees the home page.
export const ONBOARDING_SEQUENCE = [
  'submission-dialog',
  'gmail',
  'profile',
  'company-details',
  'team',
  'welcome'
];

// Which onboarding tiles appear on the home checklist.
export const SETUP_TILES = ['gmail', 'profile', 'company-details', 'team'];

export function freshDB() {
  return {
    person: [],
    company: [],
    group: [],
    person_group: [],
    permission_matrix_entry: [],
    contact_record: [],
    pending_inbox_item: [],
    _meta: {
      current_person_id: null,
      current_company_id: null,
      signed_in: false,
      verified: false,
      setup_status: {
        gmail: 'pending',
        profile: 'pending',
        'company-details': 'pending',
        team: 'pending'
      },
      checklist_dismissed: false,
      nextId: 1
    }
  };
}

export function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return freshDB();
  try {
    const loaded = JSON.parse(raw);
    // Backfill new fields if loading older state
    const def = freshDB()._meta;
    loaded._meta = { ...def, ...(loaded._meta || {}) };
    loaded._meta.setup_status = { ...def.setup_status, ...(loaded._meta.setup_status || {}) };
    return loaded;
  } catch { return freshDB(); }
}

export function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDB() {
  localStorage.removeItem(STORAGE_KEY);
}

export function nextId(db) {
  const id = db._meta.nextId || 1;
  db._meta.nextId = id + 1;
  return id;
}
