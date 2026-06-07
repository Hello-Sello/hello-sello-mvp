import { Wordmark } from '@/shared/ui/Wordmark'

/**
 * The frosted card the auth forms sit in — centered on the pink glass body,
 * Wordmark + heading on top, the form as children. Shared by login + signup so
 * the two screens stay visually identical.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
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
        {children}
        {footer && (
          <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>
        )}
      </div>
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
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
      />
    </label>
  )
}
