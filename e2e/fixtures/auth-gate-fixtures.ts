/**
 * Auth-gate test fixtures (Phase 4, Plan 01).
 *
 * Helpers to drive the shared PendingCo fixture (cccc…) into each of the four
 * broken-session states the auth-gate spec tests. Uses the service-role client
 * for direct DB mutations (same pattern as admin-verification.spec.ts) and the
 * existing `reject_company` RPC to write the rejection reason via the same
 * audit_log path that the real admin surface uses (D-07 source).
 *
 * ⚠️  `setVerifiedThenRevoked` does a direct UPDATE to 'revoked' — the HS-admin
 * revocation trigger is out of Phase 4 scope (CONTEXT Deferred Ideas). A direct
 * UPDATE is the fixture path; the test must NOT assume a revoke_company RPC exists.
 *
 * Fixture identity (from seed.sql 4b):
 *   PendingCo GmbH  · UUID cccccccc-cccc-cccc-cccc-cccccccccccc
 *   Seller person   · UUID 99999999-9999-9999-9999-999999999999 (HS reviewer — company_id NULL)
 *
 * Note: to sign in AS a seller (PendingCo member) the spec needs a dedicated
 * seller fixture user. In Phase 4, tests run as `alice@greenleaf.test` (a verified
 * seller) and then mutate her company's status directly via the service-role client
 * to reach the broken-session states. This avoids needing a brand-new user seed;
 * alice already has a company_id and a valid login.
 *
 * Fixture state reset: the spec's beforeEach calls `resetToVerified()` so each
 * test starts from a clean verified state (no stale mutation from a prior test).
 */

import { createClient } from '@supabase/supabase-js'

/** The local Supabase service-role constants (standard local dev values). */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** Alice (GreenLeaf) — a real verified seller with a company_id. */
export const ALICE_EMAIL = 'alice@greenleaf.test'
export const ALICE_PASSWORD = 'password123'
export const ALICE_COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

/** HS reviewer UUID — used as the actor_person_id for reject_company RPC calls. */
const HS_REVIEWER_ID = '99999999-9999-9999-9999-999999999999'

function makeAdminClient() {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Reset Alice's company back to 'verified' so each test starts from a clean baseline.
 * Also deletes any audit_log rows written by setRejected so the rejected-banner
 * lookup (audit_log.verb = 'company.verify_rejected') does not bleed across tests.
 */
export async function resetToVerified(): Promise<void> {
  const admin = makeAdminClient()
  await admin
    .from('company')
    .update({ verification_status: 'verified', verified_at: new Date().toISOString(), verified_by: null })
    .eq('id', ALICE_COMPANY_ID)
  // Remove rejection audit_log entries written by setRejected so the banner query
  // from a prior test run does not surface a stale reason.
  await admin
    .from('audit_log')
    .delete()
    .eq('content_type', 'company')
    .eq('content_id', ALICE_COMPANY_ID)
    .eq('action', 'company.verify_rejected')
}

/**
 * Put Alice's company into 'pending'. Simulates a mid-stepper state where the
 * company exists but has not been reviewed by HS yet (AUTH-02 / D-04).
 */
export async function setPending(): Promise<void> {
  const admin = makeAdminClient()
  await admin
    .from('company')
    .update({ verification_status: 'pending', verified_at: null, verified_by: null })
    .eq('id', ALICE_COMPANY_ID)
}

/**
 * Put Alice's company into 'rejected' by calling the existing `reject_company` RPC
 * (same path the admin surface uses). This writes `audit_log.reason` and
 * `audit_log.metadata.preset`, which is the D-07 source for the rejection banner.
 *
 * Requires the service-role key to bypass is_hs_team() — the RPC is SECURITY
 * DEFINER so RLS is not the gating mechanism; the is_hs_team() check inside the
 * function is. We call the RPC as the HS reviewer (99999…) via the service-role
 * client.
 *
 * @param reasonText  Free-text reason stored in audit_log.reason
 * @param presetCode  Preset reason code stored in audit_log.metadata.preset
 */
export async function setRejected(
  reasonText: string = 'Licence expired — resubmit with a valid document.',
  presetCode: string = 'licence_expired',
): Promise<void> {
  // Use direct service-role writes instead of the reject_company RPC.
  // The RPC requires is_hs_team() to pass (uses auth.uid()), but the service-role
  // client's JWT has no user sub so auth.uid() returns NULL and the hs_team check
  // fails. Direct writes bypass the app-layer guard and achieve the same DB state
  // (status=rejected + audit_log row) for fixture purposes. (Rule 1 bug fix.)
  const admin = makeAdminClient()
  const { error: statusError } = await admin
    .from('company')
    .update({ verification_status: 'rejected' })
    .eq('id', ALICE_COMPANY_ID)
  if (statusError) {
    throw new Error(`setRejected: company status UPDATE failed — ${statusError.message}`)
  }
  const { error: auditError } = await admin.from('audit_log').insert({
    company_id: ALICE_COMPANY_ID,
    actor_person_id: HS_REVIEWER_ID,
    actor_type: 'hs_team',
    action: 'company.verify_rejected',
    content_type: 'company',
    content_id: ALICE_COMPANY_ID,
    reason: reasonText,
    metadata: { preset: presetCode },
  })
  if (auditError) {
    throw new Error(`setRejected: audit_log INSERT failed — ${auditError.message}`)
  }
}

/**
 * Put Alice's company into 'revoked' via direct UPDATE (the HS-admin revocation
 * trigger is out of Phase 4 scope; direct UPDATE is the fixture path per CONTEXT).
 * Requires the 'revoked' lookup value to exist (added by 20260617140000_auth04_revoked_status.sql).
 */
export async function setVerifiedThenRevoked(): Promise<void> {
  // Ensure starting from verified (FK allows only lookup-table values).
  const admin = makeAdminClient()
  await admin
    .from('company')
    .update({ verification_status: 'revoked' })
    .eq('id', ALICE_COMPANY_ID)
}
