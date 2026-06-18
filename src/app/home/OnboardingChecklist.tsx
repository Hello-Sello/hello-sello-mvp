'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  Mail,
  UserRound,
  Building2,
  Package,
  ListOrdered,
  Users,
  X,
} from 'lucide-react'

export type ChecklistItem = {
  key:
    | 'connect_email'
    | 'profile'
    | 'company_details'
    | 'products'
    | 'pricelists'
    | 'connections'
  label: string
  done: boolean
}

// Icon for each of the 6 blocks — one real lucide icon per key (no emoji).
const ICONS: Record<ChecklistItem['key'], LucideIcon> = {
  connect_email: Mail,
  profile: UserRound,
  company_details: Building2,
  products: Package,
  pricelists: ListOrdered,
  connections: Users,
}

const DISMISS_KEY = 'hs-onboarding-checklist-dismissed'
const DISMISS_EVENT = 'hs-checklist-dismissed'

// Read the dismissed flag from localStorage as external state — SSR-safe (server
// snapshot = false) and without setState-in-effect. Same-tab dismisses fire a
// custom event so the subscriber re-runs.
function subscribe(callback: () => void) {
  window.addEventListener(DISMISS_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(DISMISS_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/**
 * Slim inline onboarding bar pinned to the top of Home (D-05 / UX-09).
 *
 * Layout: a single horizontal row of 6 blocks (icon + short label + state dot),
 * a small progress bar spanning all 6, and a dismiss (X) control. On mobile the
 * row scrolls horizontally — no wrapping.
 *
 * Done-state is entirely derived by the Home server component (real RLS-scoped
 * counts, not person.preferences flags — except block 1 which stays a flag until
 * email integration lands).
 *
 * Dismissible via localStorage (cosmetic; no server trust). Hides automatically
 * once every item is done.
 */
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  // SSR-safe dismiss read via useSyncExternalStore (server snapshot = false).
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(DISMISS_KEY) === '1',
    () => false,
  )

  const doneCount = items.filter((i) => i.done).length
  if (dismissed || doneCount === items.length) return null

  const progressPct = Math.round((doneCount / items.length) * 100)

  return (
    <section className="glass rounded-2xl px-4 py-3">
      {/* Header row: title + progress fraction + dismiss button */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-xs font-semibold text-ink">Finish setting up</span>
        <span className="text-xs text-ink-muted">{doneCount}/{items.length}</span>
        {/* Progress bar — spans the full available width */}
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-soft/30">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            window.dispatchEvent(new Event(DISMISS_EVENT))
          }}
          className="shrink-0 text-ink-muted transition hover:text-ink"
          aria-label="Dismiss checklist"
        >
          <X size={14} />
        </button>
      </div>

      {/* Single-row item list — scrolls horizontally on mobile (no wrap) */}
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.key]
          return (
            <li key={item.key} className="shrink-0">
              {item.done ? (
                /* Done tile — green, non-interactive */
                <span
                  className="flex items-center gap-1.5 rounded-lg bg-success/15 px-2.5 py-1.5 text-success"
                  aria-label={`${item.label} — done`}
                >
                  <Check size={12} strokeWidth={3} />
                  <span className="text-xs font-medium">{item.label}</span>
                </span>
              ) : (
                /* To-do tile — brand pink, links to the relevant onboarding step */
                <Link
                  href={`/onboarding?resume=${item.key}`}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-soft/40 px-2.5 py-1.5 text-brand transition hover:bg-brand-soft/60"
                  aria-label={`${item.label} — set up`}
                >
                  <Icon size={12} />
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
