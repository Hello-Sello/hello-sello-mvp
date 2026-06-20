/**
 * Phase 06.1 — handle_new_user() trigger integration test (06.1-01).
 *
 * The load-bearing backend fix: every signup (password, Google, Outlook/azure)
 * fires the AFTER INSERT trigger on auth.users, which must create a public.person
 * row with sensible first/last names — and never 500 on missing metadata.
 *
 * This is headless: no browser, no real OAuth. We use the service-role client's
 * admin API to create an auth.users row with each provider's metadata shape, then
 * assert the resulting public.person row. The provider metadata key shapes mirror
 * the table in 06.1-RESEARCH.md:
 *   - Password : { first_name, last_name }              (this app's signUp)
 *   - Google   : { given_name, family_name, full_name } (given/family = first/last)
 *   - Azure    : { full_name, name } only               (must split a combined name)
 *   - No-name  : {}                                      (email-derived / default first)
 *
 * RED contract (against the current trigger 20260607160000_auth_person_trigger.sql,
 * which only reads first_name/last_name):
 *   - Test 1 (password) PASSES even now — first_name/last_name are present.
 *   - Test 2 (Google)   FAILS — blank names (no first_name/last_name keys).
 *   - Test 3 (azure)    FAILS — blank names.
 *   - Test 4 (no-name)  FAILS — blank first_name (no email-derived fallback).
 * Task 2's migration turns all four GREEN.
 *
 * Each test cleans up its auth.users row via auth.admin.deleteUser(id), which
 * cascade-deletes the person row (person.id REFERENCES auth.users ON DELETE CASCADE).
 */

import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Local Supabase service-role constants (standard local dev values — same as
// e2e/fixtures/auth-gate-fixtures.ts). The service-role key bypasses RLS and
// unlocks the auth.admin API needed to mint auth.users rows directly.
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

function makeAdminClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Create an auth.users row with the given metadata shape (firing the trigger),
 * read back the person row, and hand both to the assertion callback. Always
 * deletes the user afterward so the suite leaves no residue, even on failure.
 *
 * Unique emails per run avoid collisions with leftover rows from a crashed run.
 */
async function withSignedUpUser(
  admin: SupabaseClient,
  email: string,
  user_metadata: Record<string, unknown>,
  assertPerson: (person: { first_name: string; last_name: string; display_name: string | null }) => void,
): Promise<void> {
  const uniqueEmail = email.replace('@', `+${Date.now()}@`)
  const { data, error } = await admin.auth.admin.createUser({
    email: uniqueEmail,
    email_confirm: true,
    user_metadata,
  })
  if (error) throw new Error(`createUser failed for ${uniqueEmail}: ${error.message}`)
  const userId = data.user!.id

  try {
    const { data: person, error: personError } = await admin
      .from('person')
      .select('first_name, last_name, display_name')
      .eq('id', userId)
      .single()
    if (personError) {
      throw new Error(`person lookup failed for ${userId}: ${personError.message}`)
    }
    assertPerson(person as { first_name: string; last_name: string; display_name: string | null })
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
}

test.describe('handle_new_user() trigger — name resolution across signup shapes', () => {
  let admin: SupabaseClient

  test.beforeAll(() => {
    admin = makeAdminClient()
  })

  // ------------------------------------------------------------------------
  // Test 1 — password signup: explicit first_name/last_name (already works).
  // ------------------------------------------------------------------------
  test('password signup (first_name/last_name) → person Ada Lovelace', async () => {
    await withSignedUpUser(
      admin,
      'ada.password@example.test',
      { first_name: 'Ada', last_name: 'Lovelace' },
      (person) => {
        expect(person.first_name).toBe('Ada')
        expect(person.last_name).toBe('Lovelace')
        expect(person.display_name).toBe('Ada Lovelace')
      },
    )
  })

  // ------------------------------------------------------------------------
  // Test 2 — Google: given_name/family_name (+ full_name) → split first/last.
  // RED against the current trigger (no first_name/last_name keys → blank).
  // ------------------------------------------------------------------------
  test('Google signup (given_name/family_name) → person Grace Hopper', async () => {
    await withSignedUpUser(
      admin,
      'grace.google@example.test',
      { given_name: 'Grace', family_name: 'Hopper', full_name: 'Grace Hopper' },
      (person) => {
        expect(person.first_name).toBe('Grace')
        expect(person.last_name).toBe('Hopper')
        expect(person.display_name).toBe('Grace Hopper')
      },
    )
  })

  // ------------------------------------------------------------------------
  // Test 3 — Outlook/azure: only full_name/name → must split the combined name.
  // RED against the current trigger (no first_name/last_name keys → blank).
  // ------------------------------------------------------------------------
  test('Outlook/azure signup (full_name only) → person Linus Torvalds (split)', async () => {
    await withSignedUpUser(
      admin,
      'linus.azure@example.test',
      { full_name: 'Linus Torvalds', name: 'Linus Torvalds' },
      (person) => {
        expect(person.first_name).toBe('Linus')
        expect(person.last_name).toBe('Torvalds')
        expect(person.display_name).toBe('Linus Torvalds')
      },
    )
  })

  // ------------------------------------------------------------------------
  // Test 4 — no name metadata at all: first_name must be non-empty (email
  // local-part or default), last_name may be empty, and the row must exist
  // (the trigger must never 500). RED: current trigger yields blank first_name.
  // ------------------------------------------------------------------------
  test('signup with no name metadata → person row exists with non-empty first_name', async () => {
    await withSignedUpUser(
      admin,
      'noname@example.test',
      {},
      (person) => {
        // first_name derived from the email local-part ("noname...") or a default;
        // either way it must NOT be empty so downstream UI has something to show.
        expect(person.first_name.length).toBeGreaterThan(0)
        // last_name is allowed to be empty for a single-name / no-name signup.
        expect(person.last_name).toBeDefined()
        // display_name (canonical) must also be non-empty so onboarding completes.
        expect((person.display_name ?? '').length).toBeGreaterThan(0)
      },
    )
  })

  // ------------------------------------------------------------------------
  // Test 5 — mononym (single-name social login, e.g. Google "Muskan"): the
  // canonical display_name must be set even though last_name is empty. This is
  // the exact case that blocked onboarding before display_name became canonical.
  // ------------------------------------------------------------------------
  test('mononym signup (name only, no surname) → display_name set, last_name empty', async () => {
    await withSignedUpUser(
      admin,
      'muskan.mono@example.test',
      { name: 'Muskan' },
      (person) => {
        expect(person.display_name).toBe('Muskan')
        expect(person.first_name).toBe('Muskan')
        expect(person.last_name).toBe('') // mononym: no surname, and that's fine
      },
    )
  })
})
