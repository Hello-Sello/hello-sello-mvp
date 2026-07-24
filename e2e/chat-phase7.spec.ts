/**
 * Phase 7 - cross-cutting acceptance flows (the whole-phase e2e).
 *
 * This is the ONE place that proves the Phase-7 migrations + backend + RLS
 * actually hold together AT RUNTIME on a freshly-migrated local DB - the
 * structural gate (tsc/eslint/build) can pass falsely because the compiled
 * `database.types.ts` is a committed file. Here every assertion runs against the
 * live local stack (Postgres 54322 + the auth/rest API on 54321).
 *
 * Style: the load-bearing Phase-7 invariants are RLS + RPC contracts ("the e2e
 * proves the tenant-isolation boundaries actually hold at runtime, not just in
 * policy text" - the plan's threat model). So this spec exercises them the most
 * deterministic way: real per-user Supabase sessions (@supabase/supabase-js,
 * same anon/publishable key the app uses) driving the RPCs + RLS-scoped reads,
 * with service-role psql for the assertions a tenant-scoped client cannot see.
 * The ONE thing that must go through the app (an audit row is stamped by the
 * server ACTION, not the RPC) is minted via the two-company UI fixture.
 *
 * Coverage (the plan's load-bearing truths):
 *   - T-07-08-01: a non-member reads 0 group messages; every invited member
 *     (deal party or not) is active immediately (D-05's external gate was
 *     reversed 2026-07-20 - see migration 20260720100000).
 *   - D-27 / D-28 / T-07-08-03: the seller lands the ONE invoice artifact (the
 *     finalize precondition); an external non-member cannot read it (workspace
 *     isolation). The seller-only finalize GUARD + the pure gate are covered by
 *     the finalizeDeal server action + finalize.test.ts unit tests.
 *   - AUDIT-01: a directly-created deal (createDeal, the living-deal-card birth
 *     path) writes a deal.created audit.
 *   - OBS-3 / SELL-01 / D-18: a committed change resolves via confirm_deal_change
 *     and its narration speaks as System (not Sella).
 *
 * Seeded logins (all password123): alice@greenleaf.test (GreenLeaf, seller),
 * bob@stonepharm.test (StonePharm, buyer), eva@bavaria.test (a THIRD company -
 * the external party), david@nordcanna.test (a THIRD company - the non-member).
 * There are ZERO seeded deals locally, so the card is minted in-app at setup.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { loginAs, createDraftDealAsAlice, resetDealData } from './fixtures/two-company'

// Serial: every test shares the ONE minted card + the GreenLeaf<->StonePharm
// relationship, so they must never run in parallel against each other.
test.describe.configure({ mode: 'serial' })

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const PASSWORD = 'password123'

// A minimal structural view of the supabase client - only the methods this spec
// calls, with permissive (but not `any`) result types. The generated Database
// generic would reject `.from('deal_artifact')`/`.rpc('create_group_thread')`
// because those Phase-7 tables/RPCs are cast (`as never`) in the app; here we
// exercise them by name against the live schema, so a loose view is correct.
interface QueryResult {
  data: unknown
  error: { message: string } | null
}
interface SelectBuilder extends PromiseLike<QueryResult> {
  eq(column: string, value: string): SelectBuilder
}
interface TableBuilder {
  select(columns: string): SelectBuilder
  insert(row: Record<string, unknown>): PromiseLike<QueryResult>
}
interface LocalClient {
  from(table: string): TableBuilder
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult>
  auth: {
    signInWithPassword(creds: { email: string; password: string }): Promise<{
      data: { user: { id: string } | null }
      error: { message: string } | null
    }>
  }
}

/** Locate a usable psql binary (PATH first, then the macOS Postgres.app path). */
function psqlBin(): string {
  const candidates = ['psql', '/Applications/Postgres.app/Contents/Versions/latest/bin/psql']
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' })
      return bin
    } catch {
      // try the next candidate
    }
  }
  throw new Error('psql not found on PATH or in Postgres.app')
}

/**
 * Run one query against the LOCAL Postgres as the `postgres` superuser (bypasses
 * RLS) and return the single scalar/first-column result. Used for the assertions
 * a tenant-scoped client can NOT see (member states, audit rows, message counts)
 * and to seed a controlled held-change row. Only DB-derived uuids + fixed literals
 * are ever interpolated - never external input.
 */
function sql(query: string): string {
  return execFileSync(psqlBin(), [DB_URL, '-At', '-c', query], { encoding: 'utf8' }).trim()
}

/**
 * The local stack URL + publishable (anon) key the app uses. The Playwright
 * runner process does not inherit .env.local (only `next dev` does), so read the
 * file the app reads; fall back to the well-known local defaults.
 */
function localSupabaseConfig(): { url: string; key: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  if (!url || !key) {
    try {
      const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
      for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
        if (!m) continue
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = m[2]
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' && !key) key = m[2]
      }
    } catch {
      // fall through to the defaults below
    }
  }
  if (!url) url = 'http://127.0.0.1:54321'
  if (!key) throw new Error('chat-phase7: no NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local missing?)')
  return { url, key }
}

/** Sign one seeded user in with their own session (person.id === auth.uid). */
async function signIn(email: string): Promise<{ client: LocalClient; userId: string }> {
  const { url, key } = localSupabaseConfig()
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as LocalClient
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.user) {
    throw new Error(`chat-phase7: sign-in failed for ${email}: ${error?.message ?? 'no user'}`)
  }
  return { client, userId: data.user.id }
}

/**
 * The GreenLeaf<->StonePharm relationship's newest deal card id (resolved by
 * company NAME - the seed regenerates ids on every reset). Empty string until a
 * card is born.
 */
function bornCardId(): string {
  return sql(
    `select dc.id from public.deal_card dc
       join public.relationship r on r.id = dc.relationship_id
       join public.company ca on ca.id = r.company_a_id
       join public.company cb on cb.id = r.company_b_id
      where ((ca.name like 'GreenLeaf%' and cb.name like 'StonePharm%')
          or (ca.name like 'StonePharm%' and cb.name like 'GreenLeaf%'))
        and dc.deleted_at is null
      order by dc.created_at desc limit 1`,
  )
}

/** Poll until Alice's create has birthed the card server-side (the action lags the click). */
async function waitForBornCard(timeoutMs = 20000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = bornCardId()
    if (id) return id
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('chat-phase7: the deal card was not born within the timeout')
}

/** person.id for a seeded login email. */
function personIdByEmail(email: string): string {
  const id = sql(
    `select p.id from public.person p join auth.users u on u.id = p.id where u.email = '${email}'`,
  )
  if (!id) throw new Error(`chat-phase7: no person for ${email}`)
  return id
}

// ----- shared context, captured once (the card must be minted through the app) -----
let dealCardId = ''
let workspaceId = ''
let sellerCompanyId = ''
const PID = { alice: '', bob: '', eva: '', david: '' }
const CID = { alice: '', bob: '' }

test.beforeAll(async ({ browser }) => {
  // clean the relationship to the "no deal" state, then mint ONE live card through
  // the real app: Alice's "Start a deal" -> CardFront create-mode -> "Save draft"
  // births the card (createDeal), then the fixture clicks the card's "Send deal"
  // (Phase 12 birth/send split) - so the card here is a SENT `negotiation` deal.
  // The send matters for this spec: confirm_deal_change's commit keeps the card
  // in 'negotiation', and OBS-3's narration lands in the p2p thread the send
  // resolves/creates. createDeal itself stamps the deal.created audit row this
  // spec asserts (AUDIT-01). We deliberately do NOT open the card panel here -
  // all assertions run against the DB/RPC layer, so the spec is independent of
  // the card-open UI. Only Alice's browser is needed (there is no accept step
  // for Bob).
  resetDealData()
  const aliceContext = await browser.newContext()
  const alicePage = await aliceContext.newPage()
  await loginAs(alicePage, 'alice')
  await createDraftDealAsAlice(alicePage)
  dealCardId = await waitForBornCard()
  await aliceContext.close()
  workspaceId = sql(
    `select id from public.deal_workspace where deal_card_id = '${dealCardId}' and deleted_at is null order by created_at limit 1`,
  )
  // the SELLER company, by the same rule deal_party_field uses (offer -> initiator
  // is the seller; order -> the other side is).
  sellerCompanyId = sql(
    `select case when dc.deal_type = 'offer' then dc.initiating_company_id
                 when dc.initiating_company_id = r.company_a_id then r.company_b_id
                 else r.company_a_id end
       from public.deal_card dc
       join public.relationship r on r.id = dc.relationship_id
      where dc.id = '${dealCardId}'`,
  )
  PID.alice = personIdByEmail('alice@greenleaf.test')
  PID.bob = personIdByEmail('bob@stonepharm.test')
  PID.eva = personIdByEmail('eva@bavaria.test')
  PID.david = personIdByEmail('david@nordcanna.test')
  CID.alice = sql(`select company_id from public.person where id = '${PID.alice}'`)
  CID.bob = sql(`select company_id from public.person where id = '${PID.bob}'`)
})

/**
 * AUDIT-01: the proposal-accept (RPC) birth door must stamp its own deal.created
 * audit row. The born_now flag (07-08 migration) is what lets confirmDetectedDeal
 * write it exactly once - so the freshly-born card has the row.
 */
test('AUDIT-01: an accepted-proposal (RPC-born) deal has a deal.created audit_log row', () => {
  const n = Number(
    sql(
      `select count(*) from public.audit_log where action = 'deal.created' and content_id = '${dealCardId}'`,
    ),
  )
  expect(n).toBeGreaterThanOrEqual(1)
})

/**
 * T-07-08-01: the group-chat security surface (D-05's external gate was
 * reversed 2026-07-20 - every invited member, deal party or not, is active
 * immediately; there is no more pending_external/approve_group_member step).
 *  - a deal-card group activates EVERY invited member right away, including a
 *    THIRD company that is neither deal party;
 *  - a NON-member still reads 0 of the group's messages (RLS, not emptiness).
 */
test('group chat: every invited member (including a non-deal-party company) is active immediately; non-member reads 0 messages', async () => {
  const alice = await signIn('alice@greenleaf.test')
  const david = await signIn('david@nordcanna.test')

  // Alice (a deal party) births a deal-card group inviting Bob (the other party)
  // and Eva (a THIRD company). Nobody is gated anymore - all three go active.
  const { data: newThreadId, error: createErr } = await alice.client.rpc('create_group_thread', {
    p_name: 'Phase7 e2e group',
    p_member_person_ids: [PID.bob, PID.eva],
    p_deal_card_id: dealCardId,
  })
  expect(createErr).toBeNull()
  const gid = String(newThreadId)
  expect(gid).toBeTruthy()

  const stateOf = (personId: string) =>
    sql(
      `select state from public.chat_thread_member where thread_id = '${gid}' and person_id = '${personId}'`,
    )
  expect(stateOf(PID.alice)).toBe('active') // the creator is bootstrapped active
  expect(stateOf(PID.bob)).toBe('active') // a deal party is active
  expect(stateOf(PID.eva)).toBe('active') // a non-deal-party company is ALSO active now (no gate)

  // an ACTIVE member can write (the group WITH CHECK branch on can_access_thread).
  const { error: postErr } = await alice.client.from('chat_message').insert({
    thread_id: gid,
    sender: 'person',
    sender_person_id: alice.userId,
    type: 'message',
    body: 'e2e group hello',
  })
  expect(postErr).toBeNull()
  // the message really exists (service-role count) - so a 0 for a non-member below
  // is the RLS boundary, not an empty thread.
  expect(
    Number(sql(`select count(*) from public.chat_message where thread_id = '${gid}'`)),
  ).toBeGreaterThanOrEqual(1)

  // T-07-08-01: David is NOT a member -> RLS returns 0 of the group's messages.
  const { data: davidRows, error: davidErr } = await david.client
    .from('chat_message')
    .select('id')
    .eq('thread_id', gid)
  expect(davidErr).toBeNull()
  expect((davidRows ?? []) as unknown[]).toHaveLength(0)

  // approve_group_member no longer exists - there is nothing left to approve.
  const { error: droppedErr } = await alice.client.rpc('approve_group_member', {
    p_thread_id: gid,
    p_person_id: PID.eva,
  })
  expect(droppedErr).not.toBeNull()
})

/**
 * D-27 / D-28 / T-07-08-03: the invoice-artifact boundary. The seller lands the ONE
 * close artifact (uploaded_by_company_id = the seller, the finalize precondition);
 * an external non-workspace company cannot read it (dealart_all workspace
 * isolation). The seller-only finalize GUARD and the pure finalize gate live in the
 * finalizeDeal server action + finalize.test.ts (unit).
 */
test('D-27/D-28: the seller lands the invoice artifact; a non-member cannot read it', async () => {
  const sellerEmail = CID.alice === sellerCompanyId ? 'alice@greenleaf.test' : 'bob@stonepharm.test'
  const seller = await signIn(sellerEmail)
  const david = await signIn('david@nordcanna.test') // external, non-workspace company

  // the seller writes the invoice pointer (dealart_all WITH CHECK = workspace
  // member + shared visibility). Mirrors uploadDealInvoice's row shape.
  const storagePath = `${workspaceId}/e2e-invoice-${Date.now()}.pdf`
  const { error: insErr } = await seller.client.from('deal_artifact').insert({
    deal_workspace_id: workspaceId,
    uploaded_by_company_id: sellerCompanyId,
    title: 'e2e-invoice.pdf',
    category: 'invoice',
    storage_path: storagePath,
    original_filename: 'e2e-invoice.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1024,
    is_private: false,
    created_by: seller.userId,
  })
  expect(insErr).toBeNull()

  // exactly one SELLER invoice now exists -> the D-27 finalize precondition is met.
  const sellerInvoices = Number(
    sql(
      `select count(*) from public.deal_artifact
        where deal_workspace_id = '${workspaceId}' and category = 'invoice'
          and uploaded_by_company_id = '${sellerCompanyId}' and deleted_at is null`,
    ),
  )
  expect(sellerInvoices).toBe(1)

  // T-07-08-03 (tenant isolation): an external non-workspace company reads 0 rows.
  const { data: davidRows, error: davidErr } = await david.client
    .from('deal_artifact')
    .select('id')
    .eq('deal_workspace_id', workspaceId)
  expect(davidErr).toBeNull()
  expect((davidRows ?? []) as unknown[]).toHaveLength(0)
})

/**
 * OBS-3 / SELL-01 / D-18: a committed deal change resolves through the real
 * confirm_deal_change engine (both distinct companies accept -> commit to base+1)
 * and its narration is authored by 'system' (the neutral audit voice while Sella
 * is a placeholder), NOT 'sella'. We seed the held change directly (the propose
 * path builds a large draft; here we control the exact snapshot) and resolve it
 * through the engine both sides call.
 */
test('OBS-3/SELL-01: a committed change resolves via the engine and narrates as System', async () => {
  const alice = await signIn('alice@greenleaf.test')
  const bob = await signIn('bob@stonepharm.test')

  const base = Number(sql(`select version from public.deal_card where id = '${dealCardId}'`))
  const sellerPersonId = CID.alice === sellerCompanyId ? PID.alice : PID.bob
  const draft = JSON.stringify({
    line_items: [{ name: 'E2E line', quantity: 12, unit: 'g', unit_price: 5 }],
    value_net: 60,
    currency: 'EUR',
    summary: 'e2e obs3',
    due_date: null,
    payment_terms_code: null,
    free_delivery: false,
    note: 'e2e obs3',
  }).replace(/'/g, "''")

  // seed the held change (service role). confirm_deal_change reads it and commits.
  sql(
    `insert into public.deal_pending_change
       (deal_card_id, base_version, source, proposed_by_company, proposed_by_person, proposer_reason, draft, votes)
     values ('${dealCardId}', ${base}, 'manual', '${sellerCompanyId}', '${sellerPersonId}',
             'e2e obs3 change', '${draft}'::jsonb, '{}'::jsonb)`,
  )

  // first accept records a vote (still waiting); the second DISTINCT-company accept commits.
  const { error: e1 } = await alice.client.rpc('confirm_deal_change', {
    p_deal_card_id: dealCardId,
    p_decision: 'accept',
    p_reason: 'e2e accept a',
  })
  expect(e1).toBeNull()
  const { error: e2 } = await bob.client.rpc('confirm_deal_change', {
    p_deal_card_id: dealCardId,
    p_decision: 'accept',
    p_reason: 'e2e accept b',
  })
  expect(e2).toBeNull()

  const newVersion = base + 1
  // SELL-01/D-18: the change actually resolved via the engine (card moved to base+1).
  expect(sql(`select version from public.deal_card where id = '${dealCardId}'`)).toBe(
    String(newVersion),
  )
  // OBS-3: the commit is narrated by the System voice, not Sella. Phase 12:
  // post-split cards have NO 'deal' chat_thread (birth no longer creates one —
  // 20260724120200; confirm_deal_change's deal-thread hook guard-skips by
  // design), so the narration lands in the relationship's P2P thread. The
  // announcement rows are card-scoped via metadata.deal_card_id.
  const senders = sql(
    `select distinct m.sender from public.chat_message m
       join public.chat_thread t on t.id = m.thread_id
      where t.type = 'p2p'
        and m.type = 'deal_card_updated'
        and m.metadata->>'deal_card_id' = '${dealCardId}'
        and m.metadata->>'version' = '${newVersion}'`,
  )
  expect(senders).toBe('system')
})
