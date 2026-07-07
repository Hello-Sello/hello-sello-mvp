import { redirect } from 'next/navigation'
import { BadgeCheck, Users, Mail, Building2, Bell, Lock, Info, type LucideIcon } from 'lucide-react'
import { getCurrentUser } from '@/shared/auth'
import { createClient } from '@/shared/db/server'

/**
 * /settings/notifications — SET-04 / D-19/D-20. A READ-ONLY list of the
 * transactional account emails a user always receives.
 *
 * In a transactional-only v1 every category is always-on, so there is genuinely
 * nothing to toggle — we list them for transparency and note marketing / in-app
 * controls as future, rather than ship dead switches (Muskan: honesty over
 * theater). The categories themselves come from the DB (source of truth); this
 * page only supplies friendly copy + order and never writes.
 */

// Presentation copy per category code. The SET of categories comes from
// notification_category (is_transactional = true); this map just supplies a
// friendly title/blurb/icon + a stable order, falling back to the row's own
// description if a new category ships before its copy does.
const COPY: Record<string, { title: string; blurb: string; icon: LucideIcon; rank: number }> = {
  verification: {
    title: 'Company verification',
    blurb: 'When your company is approved or rejected.',
    icon: BadgeCheck,
    rank: 0,
  },
  join: {
    title: 'Join requests',
    blurb: 'When you ask to join a company, and when a request is approved or rejected.',
    icon: Users,
    rank: 1,
  },
  welcome: {
    title: 'Welcome',
    blurb: 'A hello when you finish onboarding.',
    icon: Mail,
    rank: 2,
  },
  membership: {
    title: 'Company membership',
    blurb: "When you're added to or removed from a company.",
    icon: Building2,
    rank: 3,
  },
}

export default async function NotificationsSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Own-row preferences are not needed for the read-only list — v1 has no write
  // path, so we just read the transactional categories the user always receives.
  const supabase = await createClient()
  const { data } = await supabase
    .from('notification_category')
    .select('code, description, is_transactional')
    .eq('is_transactional', true)

  const rows = (data ?? [])
    .map((c) => {
      const copy = COPY[c.code]
      return {
        code: c.code,
        title: copy?.title ?? c.code,
        blurb: copy?.blurb ?? c.description,
        Icon: copy?.icon ?? Bell,
        rank: copy?.rank ?? 99,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  return (
    <section className="glass-strong rounded-3xl p-6 md:p-7">
      <h1 className="text-lg font-bold text-ink">Notifications</h1>
      <p className="mb-6 text-sm text-ink-muted">
        The emails Hello Sello sends you for important account events.
      </p>

      <div className="rounded-2xl border border-white/60 bg-white/60 p-5">
        <h2 className="text-base font-bold text-ink">Account emails</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          These are transactional — tied to something that happened on your account. They&apos;re
          always on, so there&apos;s nothing to switch off here. We list them for transparency.
        </p>

        <ul className="divide-y divide-black/5">
          {rows.map((r) => (
            <li key={r.code} className="flex items-start gap-3 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-brand-deep">
                <r.Icon size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{r.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{r.blurb}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                <Lock size={12} /> Always on
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-info/20 bg-info/5 p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-info" />
        <p className="text-sm text-ink">
          <span className="font-semibold">Coming later.</span> Marketing emails and in-app
          notifications aren&apos;t part of Hello Sello yet. When they arrive, you&apos;ll be able to
          turn them on and off right here — we won&apos;t add switches until there&apos;s something
          real behind them.
        </p>
      </div>
    </section>
  )
}
