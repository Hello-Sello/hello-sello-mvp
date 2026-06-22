/**
 * RED unit contract for the Path-B /team approve/reject server actions (Phase 12,
 * Plan 01 — Wave-0, PATHB-02).
 *
 * Asserts the to-be-built validation + result-mapping contract for the two new
 * team actions, mirroring the locked '{ ok: true } | { error }' shape and the
 * UUID_RE + role-domain validation the sibling changeMemberRole already enforces
 * (src/app/team/actions.ts:139-141 — bad UUID → { error }, role not in
 * member|superadmin → { error }):
 *   - approveJoin(requestId, role) — UUID-validates requestId AND validates the
 *                                    role domain (member|superadmin); either bad → { error }.
 *   - rejectJoin(requestId, reason?) — UUID-validates requestId; bad id → { error }.
 *
 * ⚠️  RED-FIRST (Wave-0): these FAIL today — approveJoin / rejectJoin are NOT
 * exported from src/app/team/actions.ts yet (they land in 12-04). The named
 * bindings resolve to `undefined`, so calling them throws — the intended RED
 * signal, mirroring 10-01's missing-module approach. They go GREEN unchanged when
 * 12-04 exports the actions with the validation contract below.
 *
 * Import note: team/actions.ts transitively imports Next's vendored `server-only`
 * marker (via @/shared/db/admin). vitest.config.ts aliases `server-only` to an
 * empty stand-in (added in 12-01) so this module imports under the pure-node unit
 * runner — the marker only throws when bundled into a Client Component, never here.
 *
 * Pure validation layer only: malformed input is rejected BEFORE any RPC — the RPC
 * re-asserts has_permission('team.manage') + tenant scope (the real boundary).
 */
import { describe, it, expect } from 'vitest'
import * as team from '@/app/team/actions'

type ActionResult = { ok: true } | { error: string }
type TeamActions = {
  approveJoin: (requestId: string, role: string) => Promise<ActionResult>
  rejectJoin: (requestId: string, reason?: string) => Promise<ActionResult>
}

const actions = team as unknown as TeamActions

const BAD_UUID = 'not-a-uuid'
const VALID_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('team Path-B actions — validation contract (PATHB-02)', () => {
  it('approveJoin rejects a non-UUID request id with { error } (no throw)', async () => {
    const result = await actions.approveJoin(BAD_UUID, 'member')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('approveJoin rejects an out-of-domain role with { error } (no throw)', async () => {
    const result = await actions.approveJoin(VALID_UUID, 'badrole')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('rejectJoin rejects a non-UUID request id with { error } (no throw)', async () => {
    const result = await actions.rejectJoin(BAD_UUID)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })
})
