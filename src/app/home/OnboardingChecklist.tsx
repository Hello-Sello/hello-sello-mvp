'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Check, Mail, UserRound, Building2, X } from 'lucide-react'

export type ChecklistItem = {
  key: 'connect_email' | 'profile' | 'company_details'
  label: string
  done: boolean
}

const ICONS = {
  connect_email: Mail,
  profile: UserRound,
  company_details: Building2,
} as const

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
 * LangSmith-style "finish setup" checklist on Home. Lists the skippable
 * onboarding steps with done/pending state; a pending tile re-opens that step
 * via /onboarding?resume=<key>. Dismissible (× persists in localStorage), and it
 * hides itself once every item is done.
 */
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(DISMISS_KEY) === '1',
    () => false,
  )

  const doneCount = items.filter((i) => i.done).length
  if (dismissed || doneCount === items.length) return null

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Finish setting up</h2>
          <p className="text-xs text-ink-muted">{doneCount}/{items.length} complete</p>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            window.dispatchEvent(new Event(DISMISS_EVENT))
          }}
          className="text-ink-muted transition hover:text-ink"
          aria-label="Dismiss checklist"
        >
          <X size={16} />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.key]
          return (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  item.done ? 'bg-success/15 text-success' : 'bg-brand-soft/40 text-brand'
                }`}
              >
                {item.done ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
              </span>
              <span className="flex-1 text-sm font-medium text-ink">{item.label}</span>
              {item.done ? (
                <span className="text-xs font-medium text-success">Done</span>
              ) : (
                <Link
                  href={`/onboarding?resume=${item.key}`}
                  className="text-xs font-semibold text-brand transition hover:text-brand-deep"
                >
                  Set up ↗
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
