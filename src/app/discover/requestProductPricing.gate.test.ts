/**
 * The price gate on `requestProductPricing` (0022, T04 G4 ruling 3).
 *
 * The UI only offers "Request pricing" when the price is hidden (`canAsk`
 * requires `!pricePublic`), but the server action accepted the ask regardless —
 * so anything calling it directly could open a pricing conversation about a
 * price the seller already publishes. ADR §7 pushed the identical predicate
 * server-side for basket admission; this closes the matching hole here.
 *
 * Unit, not e2e, and deliberately so: the defect is only reachable by BYPASSING
 * the UI, which a browser test cannot do — the button the buyer would have to
 * click is precisely the one that is never rendered.
 *
 * The three module boundaries are mocked because the gate sits above all of
 * them: verification passes, and the product resolves through the same
 * SECURITY DEFINER door that authorised the read. `price_public` is forwarded
 * verbatim by `getDiscoverableShop` (companies.ts:316), so it is the seller's
 * own dial that the assertion turns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getDiscoverableShop = vi.fn()
const requireVerified = vi.fn()
const createClient = vi.fn()

vi.mock('@/shared/db/server', () => ({ createClient }))
vi.mock('@/shared/auth', () => ({ requireVerified }))
vi.mock('./companies', () => ({ getDiscoverableShop }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const SELLER = '11111111-1111-1111-1111-111111111111'
const PRODUCT = '22222222-2222-2222-2222-222222222222'

function product(pricePublic: boolean) {
  return { id: PRODUCT, name: 'Pedanios 31/1 COS-CA', price_public: pricePublic }
}

describe('requestProductPricing — the price gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireVerified.mockResolvedValue({ blocked: false })
  })

  it('refuses an ask on a product whose price is already public', async () => {
    getDiscoverableShop.mockResolvedValue([product(true)])
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/already shown/i)
    // the refusal is a RETURN, never a throw — the locked action shape
    expect(result).not.toHaveProperty('ok')
  })

  it('does not refuse on the price-HIDDEN product the UI actually offers', async () => {
    // The gate must not swallow the real case. This stops short of the write
    // (createClient is mocked), so the assertion is only that it got PAST the
    // price check — which is exactly what the gate is at risk of breaking.
    getDiscoverableShop.mockResolvedValue([product(false)])
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT).catch(
      (e: unknown) => ({ threw: String(e) }),
    )

    expect(JSON.stringify(result)).not.toMatch(/already shown/i)
  })

  it('still refuses a product the buyer cannot see, before reaching the price rule', async () => {
    getDiscoverableShop.mockResolvedValue([])
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect((result as { error: string }).error).toMatch(/couldn't confirm/i)
  })
})

/**
 * The connected/unconnected branch (T02, PLAN-T02.md File 2/4).
 *
 * `requestProductPricing` now holds its OWN `createClient()` call (it needs
 * one to run `is_connected_to_company` before ever reaching
 * `createPairInboxItem`, which holds a second, separate call). `createClient`
 * is extended here — round 1's N5 — from "resolves to undefined" to a
 * chainable stub whose `.rpc()` records every call (name + args) and whose
 * `.from('pending_inbox_item')` chain records any insert payload, so both
 * branches are independently observable from one mock shape:
 *   - connected:   is_connected_to_company -> true  => request_product_pricing_c2c
 *   - unconnected: is_connected_to_company -> false => createPairInboxItem (unchanged)
 *   - query error: is_connected_to_company errors   => fail CLOSED, neither fires
 *
 * `requestActionError` is NOT mocked — it is the real mapper, the same one
 * `createPairInboxItem`'s own errors already go through, so a generic RPC
 * failure is expected to surface its GENERIC text, not a raw Postgres string.
 */
describe('requestProductPricing — connected vs unconnected branch (T02)', () => {
  const SENDER_UID = '33333333-3333-3333-3333-333333333333'
  const SENDER_COMPANY = '44444444-4444-4444-4444-444444444444'
  const GENERIC_ERROR = "We couldn't complete that. Please try again."

  // Chainable stub shape for `pending_inbox_item` — select/eq/in/is/filter
  // all return the stub itself (so any chain shape resolves), while
  // `.limit()` and `.insert()` terminate with a real promise. Declared with
  // an explicit return type (not inferred) because `pendingQuery` is
  // self-referencing: the arrow functions below only read the `pendingQuery`
  // binding when CALLED, not during initialization, so the forward reference
  // is safe, but TS can't infer a type through its own circular definition.
  interface PendingQueryStub {
    select: () => PendingQueryStub
    eq: () => PendingQueryStub
    in: () => PendingQueryStub
    is: () => PendingQueryStub
    filter: () => PendingQueryStub
    limit: () => Promise<{ data: unknown[]; error: null }>
    insert: (payload: unknown) => Promise<{ error: null }>
  }

  function makeSupabaseStub(opts: {
    isConnected?: boolean | null
    isConnectedError?: { message: string } | null
    pricingRpcError?: { message: string } | null
  }) {
    const rpcCalls: Array<{ name: string; args: unknown }> = []
    const insertCalls: unknown[] = []

    // One shared chainable stub for `pending_inbox_item` — select/eq/in/is/
    // filter all return the same object (so any chain shape resolves), and
    // only `.limit()` (the dup-check read) and `.insert()` (the write)
    // terminate with a real promise, mirroring createPairInboxItem's actual
    // call shape (actions.ts:58-89).
    const pendingQuery: PendingQueryStub = {
      select: () => pendingQuery,
      eq: () => pendingQuery,
      in: () => pendingQuery,
      is: () => pendingQuery,
      filter: () => pendingQuery,
      limit: () => Promise.resolve({ data: [], error: null }),
      insert: (payload: unknown) => {
        insertCalls.push(payload)
        return Promise.resolve({ error: null })
      },
    }

    const supabase = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: SENDER_UID } } }),
      },
      rpc: vi.fn((name: string, args: unknown) => {
        rpcCalls.push({ name, args })
        if (name === 'is_connected_to_company') {
          return Promise.resolve({
            data: opts.isConnected ?? false,
            error: opts.isConnectedError ?? null,
          })
        }
        if (name === 'request_product_pricing_c2c') {
          return Promise.resolve({
            data: opts.pricingRpcError ? null : true,
            error: opts.pricingRpcError ?? null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      }),
      from: vi.fn((table: string) => {
        if (table === 'person') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { company_id: SENDER_COMPANY }, error: null }),
              }),
            }),
          }
        }
        if (table === 'pending_inbox_item') return pendingQuery
        throw new Error(`requestProductPricing.gate.test.ts stub: unexpected table "${table}"`)
      }),
    }

    return { supabase, rpcCalls, insertCalls }
  }

  // This describe block is a SIBLING of "the price gate" above, not nested
  // inside it — its beforeEach (line 39) does not apply here. Re-declared
  // explicitly so this block is self-contained and order-independent (does
  // not rely on the first describe having already run and left
  // `requireVerified` "sticky").
  beforeEach(() => {
    vi.clearAllMocks()
    requireVerified.mockResolvedValue({ blocked: false })
    getDiscoverableShop.mockResolvedValue([product(false)])
  })

  it('connected branch: calls request_product_pricing_c2c with exactly {p_receiver_company_id, p_product_id} and returns {ok:true} on success', async () => {
    const { supabase, rpcCalls } = makeSupabaseStub({ isConnected: true })
    createClient.mockResolvedValue(supabase)
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect(result).toEqual({ ok: true })
    const pricingCall = rpcCalls.find((c) => c.name === 'request_product_pricing_c2c')
    expect(pricingCall).toBeDefined()
    expect(pricingCall!.args).toEqual({ p_receiver_company_id: SELLER, p_product_id: PRODUCT })
  })

  it('connected branch: an RPC failure returns {error:...} via requestActionError, not a throw', async () => {
    const { supabase } = makeSupabaseStub({
      isConnected: true,
      pricingRpcError: { message: 'boom — some unmapped Postgres error' },
    })
    createClient.mockResolvedValue(supabase)
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect(result).toEqual({ error: GENERIC_ERROR })
  })

  it('unconnected branch (regression guard — must not change at all): request_product_pricing_c2c is never called, and the pending_inbox_item insert path fires exactly as it does today', async () => {
    const { supabase, rpcCalls, insertCalls } = makeSupabaseStub({ isConnected: false })
    createClient.mockResolvedValue(supabase)
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect(result).toEqual({ ok: true })
    expect(rpcCalls.some((c) => c.name === 'request_product_pricing_c2c')).toBe(false)
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toMatchObject({
      type: 'pricelist_request',
      sender_person_id: SENDER_UID,
      sender_company_id: SENDER_COMPANY,
      receiver_company_id: SELLER,
      status: 'pending',
      metadata: { product_id: PRODUCT },
    })
  })

  it('is_connected_to_company query error fails CLOSED to {error:...}: no RPC call for the pricing RPC, no pending_inbox_item insert', async () => {
    const { supabase, rpcCalls, insertCalls } = makeSupabaseStub({
      isConnected: null,
      isConnectedError: { message: 'read timeout' },
    })
    createClient.mockResolvedValue(supabase)
    const { requestProductPricing } = await import('@/app/discover/actions')

    const result = await requestProductPricing(SELLER, PRODUCT)

    expect(result).toEqual({ error: GENERIC_ERROR })
    // Only is_connected_to_company was ever called — falling through to
    // createPairInboxItem on a query error would let a transient fault cut a
    // pricelist_request ticket between two already-connected companies
    // (I-J2), which is exactly what "fail closed to a refusal" forbids.
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('is_connected_to_company')
    expect(insertCalls).toHaveLength(0)
  })
})
