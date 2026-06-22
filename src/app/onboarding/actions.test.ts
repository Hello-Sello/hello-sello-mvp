/**
 * RED unit contract for the Path-B onboarding server actions (Phase 12, Plan 01 —
 * Wave-0, PATHB-01/02/03).
 *
 * Asserts the to-be-built validation + result-mapping contract for the three new
 * onboarding actions, mirroring the codebase's locked '{ ok: true } | { error }'
 * shape (src/app/onboarding/actions.ts createCompany/saveProfile + the team
 * actions' UUID_RE pattern):
 *   - requestToJoin(companyId, note?) — UUID-validates companyId; bad id → { error }.
 *   - withdrawJoin(requestId)         — UUID-validates requestId; bad id → { error }.
 *   - searchCompanies(term)           — returns a result list shape; never throws.
 *
 * ⚠️  RED-FIRST (Wave-0): these FAIL today — requestToJoin / withdrawJoin /
 * searchCompanies are NOT exported from src/app/onboarding/actions.ts yet (they
 * land in 12-03). The named bindings resolve to `undefined`, so calling them
 * throws — that is the intended RED signal, mirroring 10-01's missing-module
 * approach. The specs go GREEN unchanged when 12-03 exports the actions with the
 * validation contract below. Do NOT stub the actions to pass here.
 *
 * Pure validation layer only: a malformed UUID must be rejected BEFORE any RPC or
 * DB call (the actions are not the security boundary — the SECURITY DEFINER RPCs
 * re-assert tenant scope + has_permission — but they own input validation + clean
 * {ok}|{error} mapping, exactly like approveCompany/inviteMember do).
 */
import { describe, it, expect } from 'vitest'
import * as onboarding from '@/app/onboarding/actions'

type ActionResult = { ok: true } | { error: string }
type OnboardingActions = {
  requestToJoin: (companyId: string, note?: string) => Promise<ActionResult>
  withdrawJoin: (requestId: string) => Promise<ActionResult>
  searchCompanies: (term: string) => Promise<unknown>
}

const actions = onboarding as unknown as OnboardingActions

const BAD_UUID = 'not-a-uuid'

describe('onboarding Path-B actions — validation contract (PATHB-01/02/03)', () => {
  it('requestToJoin rejects a non-UUID company id with { error } (no throw)', async () => {
    const result = await actions.requestToJoin(BAD_UUID, 'hello')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('withdrawJoin rejects a non-UUID request id with { error } (no throw)', async () => {
    const result = await actions.withdrawJoin(BAD_UUID)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('searchCompanies returns a result without throwing on an empty term', async () => {
    // Empty term is a valid "show nothing yet" state, never an exception.
    await expect(actions.searchCompanies('')).resolves.toBeDefined()
  })
})
