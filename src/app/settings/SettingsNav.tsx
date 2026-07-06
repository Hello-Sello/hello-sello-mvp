'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  User,
  KeyRound,
  Bell,
  Building2,
  Users,
  ShieldCheck,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'

/**
 * The persistent settings sidebar (SET-01, D-01/D-02): a flat, one-click list
 * split into a Personal group and — below a thin hairline + small label — an
 * Organization group. Client component so the active route highlights via
 * usePathname; the server layout owns the header data (name + company).
 *
 * The Organization SUBTREE is Superadmin-gated inside organization/layout.tsx
 * (13-10). This outer list renders the links regardless (per plan 13-09) — a
 * Member who follows one is bounced by that inner gate, so the sidebar stays a
 * single stable map of every setting.
 */

type NavItem = { href: string; label: string; icon: LucideIcon }

const PERSONAL: NavItem[] = [
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/security', label: 'Login & security', icon: KeyRound },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
]

const ORGANIZATION: NavItem[] = [
  { href: '/settings/organization/profile', label: 'Company profile', icon: Building2 },
  { href: '/settings/organization/team', label: 'Team', icon: Users },
  { href: '/settings/organization/security', label: 'Security', icon: ShieldCheck },
]

export function SettingsNav({
  displayName,
  companyName,
}: {
  displayName: string
  companyName: string | null
}) {
  const pathname = usePathname()

  return (
    <nav className="glass flex h-fit w-full shrink-0 flex-col rounded-3xl p-4 md:w-64">
      {/* header — whose settings these are */}
      <div className="mb-3 flex items-center gap-3 px-1 pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-brand-deep">
          <SettingsIcon size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold leading-tight text-ink">Settings</p>
          <p className="truncate text-xs text-ink-muted">
            {displayName}
            {companyName ? ` · ${companyName}` : ''}
          </p>
        </div>
      </div>

      <Group label="Personal" items={PERSONAL} pathname={pathname} />

      {/* D-02 — a thin hairline + small label lightly separates the two zones */}
      <div className="mt-3.5 border-t border-black/10 pt-3.5">
        <Group label="Organization" items={ORGANIZATION} pathname={pathname} />
      </div>
    </nav>
  )
}

function Group({
  label,
  items,
  pathname,
}: {
  label: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      {items.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </div>
  )
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon
  const active = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition motion-reduce:transition-none ${
        active
          ? 'bg-brand text-white shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--color-brand)_60%,transparent)]'
          : 'text-ink hover:bg-white/70'
      }`}
    >
      <Icon
        size={17}
        strokeWidth={active ? 2.1 : 1.75}
        className={active ? 'shrink-0 text-white' : 'shrink-0 text-ink-muted'}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}
