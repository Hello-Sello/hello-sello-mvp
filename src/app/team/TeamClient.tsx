'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Trash2, AlertCircle, Clock, ShieldCheck } from 'lucide-react'
import { Avatar } from '@/shared/ui/Avatar'
import {
  inviteMember,
  changeMemberRole,
  removeMember,
  approveJoin,
  rejectJoin,
  type TeamMember,
  type PendingJoinRequest,
} from './actions'

type Role = 'member' | 'superadmin'

// Equal-geometry button base for Approve (brand) + Reject (danger): per the
// UI-SPEC hard rule, the two share identical px/py/rounded/text classes — only the
// background color differs (appended by each caller).
// `border border-transparent` keeps the box model identical to Reject's bordered
// danger style — the two buttons stay pixel-for-pixel equal (UI-SPEC hard rule).
const ROW_ACTION_BTN = 'rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition'

// Human-friendly relative time ("just now", "2 days ago") for a request row.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * TeamClient — the rendered team surface (D-14, signed-off prototype
 * prototypes/team-management-prototype/index.html). Pure UI over the plan-05 actions:
 * it renders the list and drives invite / role-change / remove off their
 * `{ ok } | { error }` results. The server is the authz + lockout boundary (D-15);
 * everything here is convenience. Revalidation comes from the actions (revalidatePath),
 * surfaced by router.refresh() after a successful mutation.
 *
 * Three sign-off refinements over the mock:
 *  1. Your own row is read-only (just the "You" tag) — no self role-select / remove.
 *  2. Editable rows drop the redundant role pill (the select already states the role);
 *     pending rows (no select) keep the amber "Pending" badge.
 *  3. Pending invite rows are read-only — no resend/cancel this phase.
 */
export function TeamClient({
  members,
  pendingRequests,
  companyName,
  currentUserId,
}: {
  members: TeamMember[]
  pendingRequests: PendingJoinRequest[]
  companyName: string | null
  currentUserId: string
}) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)
  // Per-row inline error (the D-15 lockout shows under the acting row).
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  // The open approve / reject dialog target (Path B queue).
  const [approveTarget, setApproveTarget] = useState<PendingJoinRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingJoinRequest | null>(null)

  const peopleCount = members.length

  function refresh() {
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Pending requests (Path B, D-07): a SECTION above the Team card, not a tab.
          The mb-12 (48px / 2xl) is the major section break declared in the UI-SPEC. */}
      <PendingRequestsSection
        requests={pendingRequests}
        companyName={companyName}
        onApprove={(r) => setApproveTarget(r)}
        onReject={(r) => setRejectTarget(r)}
      />

      <div className="glass overflow-hidden rounded-3xl">
        {/* header */}
        <div className="flex items-center gap-4 px-7 pb-5 pt-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">Team</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {companyName ? `${companyName} · ` : ''}
              {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="flex-1" />
          {/* Hidden while the invite modal is open: avoids a second stacked modal AND
              keeps the modal's "Send invite" the only invite-named button on screen. */}
          {!inviteOpen && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
            >
              <UserPlus size={15} /> Invite member
            </button>
          )}
        </div>

        {/* member list — a real <table> so each row is an accessible role="row" */}
        <table className="w-full border-collapse">
          <tbody>
            {members.map((m) => (
              <MemberRow
                key={m.personId ?? `pending:${m.email}`}
                member={m}
                isSelf={m.personId === currentUserId}
                rowError={rowError}
                onRoleChange={(role) =>
                  doRoleChange(m, role, { setRowError, refresh })
                }
                onRemove={() => {
                  setRowError(null)
                  setRemoveTarget(m)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 px-1 text-xs leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">Superadmin</span> manages people and the company
        profile; <span className="font-semibold text-ink">Members</span> do everything else.{' '}
        <span className="font-semibold text-ink">Pending</span> means invited but not yet accepted.
        The last Superadmin is protected and can&apos;t be removed or demoted.
      </p>

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false)
            refresh()
          }}
        />
      )}

      {removeTarget && (
        <RemoveDialog
          member={removeTarget}
          companyName={companyName}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            setRemoveTarget(null)
            refresh()
          }}
        />
      )}

      {approveTarget && (
        <ApproveDialog
          request={approveTarget}
          companyName={companyName}
          onClose={() => setApproveTarget(null)}
          onApproved={() => {
            setApproveTarget(null)
            refresh()
          }}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          request={rejectTarget}
          companyName={companyName}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            setRejectTarget(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ---- Pending requests section (Path B queue, D-07) --------------------------
// A card ABOVE the Team card. The empty state renders INLINE (the section never
// vanishes) so a Superadmin discovers the surface — this is reached ONLY on a
// successful zero-row fetch; a failed fetch short-circuited to the page error card.
function PendingRequestsSection({
  requests,
  companyName,
  onApprove,
  onReject,
}: {
  requests: PendingJoinRequest[]
  companyName: string | null
  onApprove: (r: PendingJoinRequest) => void
  onReject: (r: PendingJoinRequest) => void
}) {
  const where = companyName ?? 'your company'
  const count = requests.length

  return (
    <div className="glass mb-12 overflow-hidden rounded-3xl">
      <div className="flex items-center gap-3 px-7 pb-4 pt-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">Pending requests</h2>
        {count > 0 && (
          <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-deep">
            {count}
          </span>
        )}
      </div>
      <p className="px-7 pb-5 text-sm text-ink-muted">
        People asking to join {where}. Approve to add them as a member.
      </p>

      {count === 0 ? (
        <div className="border-t border-brand-deep/[0.07] px-7 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No pending requests</p>
          <p className="mt-1 text-sm text-ink-muted">
            When someone asks to join {where}, they&apos;ll show up here for you to approve.
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {requests.map((r) => (
              <tr
                key={r.id}
                className="border-t border-brand-deep/[0.07] align-middle transition hover:bg-white/40"
              >
                <td className="py-4 pl-7 pr-3">
                  <div className="flex items-center gap-3.5">
                    <Avatar url={null} name={r.requesterName || 'New requester'} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {r.requesterName || 'New requester'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                          <Clock size={11} /> Pending
                        </span>
                      </div>
                      <p className="truncate text-xs text-ink-muted">
                        Requested {relativeTime(r.requestedAt)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-7 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {/* Equal geometry (ROW_ACTION_BTN); only the color differs. */}
                    <button
                      type="button"
                      onClick={() => onApprove(r)}
                      className={`${ROW_ACTION_BTN} bg-brand text-white shadow-sm hover:bg-brand-deep`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(r)}
                      className={`${ROW_ACTION_BTN} border border-danger/20 bg-danger/[0.06] text-danger hover:bg-danger/10`}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---- approve-request dialog (Path B) ----------------------------------------
// Mirrors InviteDialog: role <select> (default member) + the verbatim role hint;
// useTransition submit → approveJoin → router.refresh() on { ok }. A raced-out
// approval shows the server's "This request was already handled." via DialogError;
// no optimistic lock — the next refresh drops the row (the RPC is the authority).
function ApproveDialog({
  request,
  companyName,
  onClose,
  onApproved,
}: {
  request: PendingJoinRequest
  companyName: string | null
  onClose: () => void
  onApproved: () => void
}) {
  const [role, setRole] = useState<Role>('member') // default Member (D-08)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const name = request.requesterName || 'this person'
  const where = companyName ?? 'your company'

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await approveJoin(request.id, role)
      if ('error' in r) {
        setError(r.error) // verbatim server copy (incl. the raced-out string)
        return
      }
      onApproved()
    })
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Approve {name}?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {name} will join {where} with the role you choose below. They get access immediately.
      </p>

      <div className="mt-5">
        <label
          htmlFor="approve-role"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink"
        >
          Role
        </label>
        <select
          id="approve-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full cursor-pointer rounded-xl border border-black/[0.14] bg-white/80 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        >
          <option value="member">Member</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <p className="mt-1.5 text-[11.5px] text-ink-muted">
          Defaults to Member. Members can do everything except manage the team and company profile.
        </p>
      </div>

      {error && <DialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Approve & add'}
        </button>
      </div>
    </Overlay>
  )
}

// ---- reject-request dialog (Path B) -----------------------------------------
// Mirrors RemoveDialog's shape with an OPTIONAL reason textarea; danger primary.
function RejectDialog({
  request,
  companyName,
  onClose,
  onRejected,
}: {
  request: PendingJoinRequest
  companyName: string | null
  onClose: () => void
  onRejected: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const name = request.requesterName || 'this person'
  const where = companyName ?? 'your company'

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await rejectJoin(request.id, reason.trim() || undefined)
      if ('error' in r) {
        setError(r.error)
        return
      }
      onRejected()
    })
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Reject {name}&apos;s request?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        They won&apos;t join {where}. They can request again later.
      </p>

      <div className="mt-5">
        <label
          htmlFor="reject-reason"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink"
        >
          Reason (optional)
        </label>
        <textarea
          id="reject-reason"
          name="reason"
          rows={3}
          autoFocus
          placeholder="Add a note for the audit log (optional)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full resize-none rounded-xl border border-black/[0.14] bg-white/80 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </div>

      {error && <DialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </Overlay>
  )
}

// Role change runs inline (no dialog); the D-15 lockout surfaces under the row and the
// select snaps back because router.refresh() re-renders from the unchanged server state.
function doRoleChange(
  member: TeamMember,
  role: Role,
  { setRowError, refresh }: { setRowError: (e: { id: string; message: string } | null) => void; refresh: () => void },
) {
  if (!member.personId) return
  setRowError(null)
  changeMemberRole(member.personId, role).then((r) => {
    if ('error' in r) {
      setRowError({ id: member.personId!, message: r.error })
      refresh() // re-renders the select back to the server-truth role
      return
    }
    refresh()
  })
}

// ---- a single member row ----------------------------------------------------
function MemberRow({
  member,
  isSelf,
  rowError,
  onRoleChange,
  onRemove,
}: {
  member: TeamMember
  isSelf: boolean
  rowError: { id: string; message: string } | null
  onRoleChange: (role: Role) => void
  onRemove: () => void
}) {
  const pending = member.status === 'pending'
  const name = member.displayName?.trim() || member.email
  const showError = !pending && rowError?.id === member.personId
  // Sign-off #1: your own row is read-only. Sign-off #3: pending rows are read-only.
  const editable = !pending && !isSelf

  return (
    <>
      <tr className="border-t border-brand-deep/[0.07] align-middle transition hover:bg-white/40">
        <td className="py-4 pl-7 pr-3">
          <div className="flex items-center gap-3.5">
            <Avatar url={null} name={name} size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{name}</span>
                {isSelf && (
                  <span className="inline-flex items-center rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[11px] font-bold text-info">
                    You
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-ink-muted">
                {pending ? `Invited as ${roleLabel(member.role)} · awaiting accept` : member.email}
              </p>
            </div>
          </div>
        </td>

        <td className="py-4 pr-7 text-right">
          <div className="flex items-center justify-end gap-2.5">
            {pending ? (
              // Pending: read-only amber badge, no actions (sign-off #3).
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                <Clock size={11} /> Pending
              </span>
            ) : editable ? (
              // Editable active member: role select (no redundant pill — sign-off #2) + remove.
              <>
                <RoleSelect value={member.role} onChange={onRoleChange} />
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/[0.06] px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </>
            ) : (
              // Self (read-only): show the role as a pill — no self-actions (sign-off #1).
              <RolePill role={member.role} />
            )}
          </div>
        </td>
      </tr>
      {showError && (
        <tr>
          <td colSpan={2} className="pb-3.5 pl-[88px] pr-7">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <AlertCircle size={13} /> {rowError!.message}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <select
      aria-label="Member role"
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
      className="cursor-pointer rounded-lg border border-black/[0.14] bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
    >
      <option value="member">Member</option>
      <option value="superadmin">Superadmin</option>
    </select>
  )
}

function RolePill({ role }: { role: Role }) {
  if (role === 'superadmin') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand-deep">
        <ShieldCheck size={11} /> Superadmin
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-black/[0.08] bg-black/[0.05] px-2.5 py-1 text-[11px] font-bold text-ink-muted">
      Member
    </span>
  )
}

function roleLabel(role: Role) {
  return role === 'superadmin' ? 'Superadmin' : 'Member'
}

// ---- invite dialog (flow 2) -------------------------------------------------
function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member') // default Member (D-08)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await inviteMember(email.trim(), role)
      if ('error' in r) {
        setError(r.error) // D-09 existing-account message comes through verbatim
        return
      }
      onInvited()
    })
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Invite a colleague</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        They&apos;ll get an email link to set a password and join your company. They become an active
        member as soon as they accept — no second approval.
      </p>

      <div className="mt-5">
        <label htmlFor="invite-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          autoFocus
          autoComplete="off"
          placeholder="name@company.de"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          className="w-full rounded-xl border border-black/[0.14] bg-white/80 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="invite-role" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full cursor-pointer rounded-xl border border-black/[0.14] bg-white/80 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        >
          <option value="member">Member</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <p className="mt-1.5 text-[11.5px] text-ink-muted">
          Defaults to Member. Members can do everything except manage the team and company profile.
        </p>
      </div>

      {error && <DialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Overlay>
  )
}

// ---- remove confirm dialog (flow 4) -----------------------------------------
function RemoveDialog({
  member,
  companyName,
  onClose,
  onRemoved,
}: {
  member: TeamMember
  companyName: string | null
  onClose: () => void
  onRemoved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const name = member.displayName?.trim() || member.email
  const where = companyName ?? 'your company'

  function confirm() {
    if (!member.personId) return
    setError(null)
    startTransition(async () => {
      const r = await removeMember(member.personId!)
      if ('error' in r) {
        setError(r.error) // D-15 lockout + partial-success messages come through verbatim
        return
      }
      onRemoved()
    })
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Remove member?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">{name}</span> will lose access to {where}{' '}
        immediately and their active session ends. Their account and everything they authored stay
        intact — you can re-invite them later.
      </p>

      {error && <DialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <GhostButton onClick={onClose} disabled={pending}>
          Cancel
        </GhostButton>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </Overlay>
  )
}

// ---- shared dialog shell ----------------------------------------------------
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/20 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="glass-strong relative w-full max-w-md rounded-3xl p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-muted transition hover:bg-black/[0.05] hover:text-ink"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

function DialogError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-3.5 py-3 text-sm font-semibold leading-snug text-danger">
      <AlertCircle size={16} className="mt-px shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-black/[0.04] px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/[0.07] disabled:opacity-50"
    >
      {children}
    </button>
  )
}
