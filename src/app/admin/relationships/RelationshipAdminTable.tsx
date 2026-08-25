'use client'

import { useState, useTransition } from 'react'
import { suspendRelationship, reactivateRelationship, endRelationship } from './actions'

export type RelationshipAdminRow = {
  id: string
  company_a_id: string
  company_a_name: string
  company_b_id: string
  company_b_name: string
  status: string
  connected_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function RelationshipAdminTable({ rows }: { rows: RelationshipAdminRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">No relationships yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-2 pr-4">Company A</th>
            <th className="py-2 pr-4">Company B</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Connected</th>
            <th className="py-2 pr-4">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row }: { row: RelationshipAdminRow }) {
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(action: (id: string, reason: string) => Promise<{ ok: true } | { error: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action(row.id, reason)
      if ('error' in result) {
        setError(result.error)
      } else {
        setReason('')
      }
    })
  }

  return (
    <tr className="border-b border-ink/5 align-top">
      <td className="py-2 pr-4">{row.company_a_name}</td>
      <td className="py-2 pr-4">{row.company_b_name}</td>
      <td className="py-2 pr-4">{row.status}</td>
      <td className="py-2 pr-4 text-ink-muted">{fmtDate(row.connected_at)}</td>
      <td className="py-2 pr-4">
        {row.status !== 'ended' && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            disabled={isPending}
            className="mb-1 block w-40 rounded-lg border border-ink/10 bg-white/70 px-2 py-1 text-[12px] text-ink placeholder:text-ink/35"
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          {row.status === 'active' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(suspendRelationship)}
              className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Suspend
            </button>
          )}
          {row.status === 'suspended' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(reactivateRelationship)}
              className="rounded-full bg-success px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Reactivate
            </button>
          )}
          {(row.status === 'active' || row.status === 'suspended') && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(endRelationship)}
              className="rounded-full bg-danger px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              End
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </td>
    </tr>
  )
}
