import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import { ReviewActions } from './ReviewActions'
import { LicenceViewer, type LicenceFileMeta } from './LicenceViewer'

type DetailRow = {
  id: string
  name: string
  country: string
  type_codes: string[]
  verification_status: string
  created_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Full-page review screen (D-01 / D-15 Variant-B drill-in).
 *
 * Reads the company info via get_verification_detail (SECURITY DEFINER, is_hs_team()-
 * gated). Renders the "‹ Back to queue" affordance, the .kv company info grid, and
 * mounts ReviewActions (one-click approve + stubbed reject entry point).
 *
 * Licence viewer region is a clearly-marked placeholder — 03-03 fills it with
 * createSignedUrl inline viewing per D-02/03/04.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CompanyReviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params

  // Reject non-UUID values before any DB call (CR-03 / T-03 UUID guard).
  if (!UUID_RE.test(companyId)) notFound()

  const supabase = await createClient()

  // Un-regenerated RPC: localized cast (codebase pattern, STATE.md 2026-06-11).
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: DetailRow[] | null; error: { message: string } | null }>
  }).rpc('get_verification_detail', { p_company_id: companyId })

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-red-600">Could not load company details: {error.message}</p>
      </div>
    )
  }

  const company = data?.[0]
  if (!company) notFound()

  // Fetch licence metadata for the viewer (D-02/03/04).
  // Un-regenerated RPC: localized cast.
  const { data: licenceData } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: LicenceFileMeta[] | null; error: { message: string } | null }>
  }).rpc('get_company_licences', { p_company_id: companyId })

  const licences: LicenceFileMeta[] = licenceData ?? []

  // Fetch the company-level description for the viewer (D-03).
  // Direct read is acceptable — the layout already confirmed is_hs_team().
  const { data: descData } = await supabase
    .from('company')
    .select('description')
    .eq('id', companyId)
    .single()

  const sellerDescription: string | null = (descData as { description: string | null } | null)?.description ?? null

  const isPending = company.verification_status === 'pending'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back bar (D-15 Variant-B .backbar) */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/admin/verifications"
          className="flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-sm font-bold text-ink hover:bg-ink/[0.03]"
        >
          ‹ Back to queue
        </Link>
        <span className="text-sm text-ink-muted">
          Reviewing {isPending ? 'pending' : company.verification_status} company
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        {/* Left: company info card */}
        <div className="rounded-2xl border border-ink/10 bg-white p-6">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-ink">{company.name}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {company.type_codes.join(', ') || '—'} · {company.country} · submitted{' '}
                {fmtDate(company.created_at)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
                company.verification_status === 'verified'
                  ? 'bg-green-50 text-green-700'
                  : company.verification_status === 'rejected'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-purple-50 text-purple-700'
              }`}
            >
              {company.verification_status}
            </span>
          </div>

          {/* Company info grid (.kv) */}
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
            Company
          </p>
          <dl className="mb-5 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">Type</dt>
            <dd className="font-semibold text-ink">
              {company.type_codes.length > 0 ? company.type_codes.join(', ') : '—'}
            </dd>
            <dt className="text-ink-muted">Country</dt>
            <dd className="font-semibold text-ink">{company.country}</dd>
            <dt className="text-ink-muted">Submitted</dt>
            <dd className="font-semibold text-ink">{fmtDate(company.created_at)}</dd>
            <dt className="text-ink-muted">Status</dt>
            <dd className="font-semibold text-ink capitalize">{company.verification_status}</dd>
          </dl>

          {/* Licence viewer — view-only, signed URL, 60 s TTL (D-02/03/04) */}
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
            Licence document(s) · view-only
          </p>
          <LicenceViewer
            companyId={company.id}
            licences={licences}
            sellerDescription={sellerDescription}
          />
        </div>

        {/* Right: actions sidebar */}
        <div className="rounded-2xl border border-ink/10 bg-white p-5">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
            Review actions
          </p>
          <ReviewActions
            companyId={company.id}
            companyName={company.name}
            isPending={isPending}
          />
        </div>
      </div>
    </div>
  )
}
