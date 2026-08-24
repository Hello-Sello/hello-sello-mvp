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
