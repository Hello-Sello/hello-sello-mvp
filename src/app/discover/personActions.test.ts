/**
 * RED unit contract for the Discover person-connect server actions (Lane B, PG-8/9).
 *
 * Mirrors the team Path-B actions test: assert the pure validation layer that runs
 * BEFORE any Supabase call — a malformed person id is rejected with the locked
 * '{ ok: true } | { error }' shape, never a throw. The DB boundary (RLS, the
 * connect_person insert, accept_person_connection) is proven by pgTAP
 * (inbox_person_rls / accept_person_connection), not here.
 *
 * ⚠️  RED-FIRST (PG-8/9): these FAIL today — sendPersonConnectRequest /
 * acceptPersonRequest / declinePersonRequest are not exported from
 * src/app/discover/personActions.ts yet, so the bindings are undefined and calling
 * them throws. They go GREEN when the actions land with a UUID guard first.
 *
 * server-only note: personActions.ts imports @/shared/db/server (+ auth), which
 * pull Next's vendored `server-only` marker; vitest.config.ts aliases it to an
 * empty stand-in, so this imports fine under the node unit runner.
 */
import { describe, it, expect } from 'vitest'
import * as personActions from '@/app/discover/personActions'

type ActionResult = { ok: true } | { error: string }
type PersonActions = {
  sendPersonConnectRequest: (targetPersonId: string) => Promise<ActionResult>
  acceptPersonRequest: (itemId: string) => Promise<ActionResult>
  declinePersonRequest: (itemId: string) => Promise<ActionResult>
}

const actions = personActions as unknown as PersonActions
const BAD_UUID = 'not-a-uuid'

describe('Discover person-connect actions — validation contract (PG-8/9)', () => {
  it('sendPersonConnectRequest rejects a non-UUID person id with { error } (no throw)', async () => {
    const result = await actions.sendPersonConnectRequest(BAD_UUID)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('acceptPersonRequest rejects a non-UUID item id with { error } (no throw)', async () => {
    const result = await actions.acceptPersonRequest(BAD_UUID)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })

  it('declinePersonRequest rejects a non-UUID item id with { error } (no throw)', async () => {
    const result = await actions.declinePersonRequest(BAD_UUID)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/\S/)
  })
})
