import { BadgeCheck } from 'lucide-react'
import { Wordmark } from '@/shared/ui/Wordmark'

/**
 * The frosted card the auth forms sit in — centered on the pink glass body,
 * Wordmark + heading on top, the form as children. Shared by login + signup so
 * the two screens stay visually identical. `highlights` adds the value-prop
 * bullets under the heading (signup uses them; login leaves them off).
 */
export function AuthCard({
  title,
  subtitle,
  highlights,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  highlights?: string[]
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Wordmark />
          <div>
            <h1 className="text-lg font-semibold text-ink">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            )}
          </div>
        </div>
        {highlights && highlights.length > 0 && (
          <ul className="mb-6 flex flex-col gap-2.5">
            {highlights.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm text-ink">
                <BadgeCheck
                  size={18}
                  strokeWidth={2.25}
                  className="shrink-0 text-brand"
                />
                {point}
              </li>
            ))}
          </ul>
        )}
        {children}
        {footer && (
          <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>
        )}
      </div>
    </div>
  )
}

/**
 * A horizontal "or" divider — a centered label flanked by hairlines. Sits between
 * the social buttons and the email/password form (login uses "or"; signup uses
 * "or sign up with email"). Matches the prototype's faint ink/12 rules.
 */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
      <span className="h-px flex-1 bg-ink/12" />
      {label}
      <span className="h-px flex-1 bg-ink/12" />
    </div>
  )
}

/** A labelled text input — the only field shape the auth forms use. */
export function Field({
  label,
  name,
  type = 'text',
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      {/* Medium border (prototype): grey ink/30 at rest, ink/45 on hover, white
          fill, brand border + brand-soft ring on focus. Replaces the old
          near-invisible white/70 outline. */}
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-ink/30 bg-white/90 px-3 py-2 text-sm text-ink outline-none transition hover:border-ink/[0.45] focus:border-brand focus:ring-2 focus:ring-brand-soft"
      />
    </label>
  )
}
