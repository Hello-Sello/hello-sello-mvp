/**
 * RED unit contract for the SET-02 account-&-company lifecycle server actions
 * (Phase 13, Plan 01 — Wave-0, SET-02).
 *
 * Pins the to-be-built validation contract for the five self-serve lifecycle
 * actions, mirroring the locked '{ ok: true } | { error }' shape and the
 * "reject bad input BEFORE any RPC/auth call, never throw" discipline the sibling
 * src/app/team/actions.ts already enforces (bad UUID / out-of-domain role → { error }):
 *   - deactivateAccount()               — reversible soft-disable (D-09)
 *   - requestAccountDeletion(password)  — GDPR erasure request; password re-entry (D-10)
 *   - cancelAccountDeletion()           — undo inside the 30-day grace window (D-09)
 *   - verifyPassword(password)          — identity re-check that gates delete (D-10)
 *   - deactivateCompany()               — Superadmin company deactivate (D-12)
 *
 * Validation contract asserted here: a missing/empty password → { error } with NO
 * throw — the empty password is rejected before any signInWithPassword / RPC call
 * (the RPC re-asserts the caller = auth.uid() + the sole-Superadmin guard; the action
 * only validates input + maps errors).
 *
 * ⚠️  RED-FIRST (Wave-0): these FAIL today because '@/app/settings/security/actions'
 * does NOT exist yet — the missing-module import resolution is the intended RED signal
 * (exactly like 10-01's missing <VerifiedBadge> module). They go GREEN unchanged when
 * 13-08 authors the actions module with the validation contract below. Do NOT create
 * the actions module here — that is 13-08.
 *
 * Import note: settings/security/actions.ts (a 'use server' module) will transitively
 * import Next's vendored `server-only` marker (via @/shared/db/admin). vitest.config.ts
 * aliases `server-only` to an empty stand-in so the module imports under the pure-node
 * unit runner — the marker only throws when bundled into a Client Component, never here.
 */
import { describe, it, expect } from 'vitest'
import * as security from '@/app/settings/security/actions'

type ActionResult = { ok: true } | { error: string }
type SecurityActions = {
  deactivateAccount: () => Promise<ActionResult>
  requestAccountDeletion: (password: string) => Promise<ActionResult>
  cancelAccountDeletion: () => Promise<ActionResult>
  verifyPassword: (password: string) => Promise<ActionResult>
  deactivateCompany: () => Promise<ActionResult>
}

const actions = security as unknown as SecurityActions

describe('settings/security lifecycle actions — validation contract (SET-02)', () => {
  describe('requestAccountDeletion', () => {
    it('rejects an empty password with { error } (no throw, no RPC)', async () => {
      const result = await actions.requestAccountDeletion('')
      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toMatch(/\S/)
    })
  })

  describe('verifyPassword', () => {
    it('rejects an empty password with { error } (no throw, no RPC)', async () => {
      const result = await actions.verifyPassword('')
      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toMatch(/\S/)
    })
  })
})
