'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Password input matching the auth `Field` box (AuthCard.tsx), with a show/hide
 * eye button sitting INSIDE the box on the right. Client component — it holds
 * the reveal state.
 *
 * A11y: the eye is a real <button type="button"> (keyboard-operable, won't submit
 * the form). Its accessible name is a STABLE `aria-label="Show password"`; the
 * on/off state is carried by `aria-pressed` rather than by swapping the label —
 * swapping the accessible name on toggle is a known screen-reader anti-pattern.
 * The icon and `title` (sighted tooltip) do flip.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string
  name: string
  autoComplete?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <div className="relative">
        <input
          name={name}
          type={shown ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          className="w-full rounded-xl border border-ink/30 bg-white/90 px-3 py-2 pr-11 text-sm text-ink outline-none transition hover:border-ink/[0.45] focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label="Show password"
          aria-pressed={shown}
          title={shown ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition hover:bg-brand/10 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  )
}
