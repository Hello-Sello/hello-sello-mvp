'use client'

import { useState } from 'react'
import Link from 'next/link'

// Row shape returned by list_pending_verifications()
export type PendingRow = {
  id: string
  name: string
  country: string
  submitted_at: string
  type_codes: string[]
  has_licence: boolean
}

type Tab = 'pending' | 'decided'

function ageDays(submittedAt: string): number {
  const ms = Date.now() - new Date(submittedAt).getTime()
  return Math.round(ms / 86_400_000)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function AgeCell({ submittedAt }: { submittedAt: string }) {
  const days = ageDays(submittedAt)
  const cls =
    days >= 5 ? 'text-red-600 font-bold' : days >= 3 ? 'text-amber-600 font-semibold' : 'text-ink-muted'
  return (
    <span className={cls}>
      {days === 0 ? 'today' : `${days}d`}
    </span>
  )
}

function LicenceBadge({ hasLicence }: { hasLicence: boolean }) {
  return hasLicence ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
      licence
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      no licence
    </span>
  )
}

// VerificationQueue owns the Pending/Decided tab switch (D-07).
// The Decided tab shows a placeholder for now — the decided RPC + audit echo land in 03-03.
export function VerificationQueue({ rows }: { rows: PendingRow[] }) {
  const [tab, setTab] = useState<Tab>('pending')

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 inline-flex gap-1 rounded-xl border border-ink/10 bg-white p-1">
        <button
          onClick={() => setTab('pending')}
          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${
            tab === 'pending' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Pending
          <span className="ml-1.5 opacity-75">{rows.length}</span>
        </button>
        <button
          onClick={() => setTab('decided')}
          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${
            tab === 'decided' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Decided
        </button>
      </div>

      {tab === 'decided' ? (
        // Placeholder — decided RPC + audit echo land in 03-03
        <div className="rounded-2xl border border-dashed border-ink/20 bg-white px-6 py-10 text-center text-sm text-ink-muted">
          Decided companies will appear here once the reject flow is built (03-03).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white px-6 py-10 text-center">
          <p className="text-base font-semibold text-ink">All clear</p>
          <p className="mt-1 text-sm text-ink-muted">No companies are waiting for review.</p>
        </div>
      ) : (
        /* Variant-B table (D-15) */
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Submitted
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Licence
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">
                  In queue
                </th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-ink/10 last:border-0 hover:bg-ink/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/verifications/${row.id}`}
                      className="block font-extrabold text-ink hover:text-brand"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">
                    {row.type_codes.length > 0 ? row.type_codes.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{row.country}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{fmtDate(row.submitted_at)}</td>
                  <td className="px-4 py-3">
                    <LicenceBadge hasLicence={row.has_licence} />
                  </td>
                  <td className="px-4 py-3">
                    <AgeCell submittedAt={row.submitted_at} />
                  </td>
                  <td className="px-4 py-3 text-right text-ink-muted">
                    <Link href={`/admin/verifications/${row.id}`} tabIndex={-1} aria-hidden>
                      ›
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
