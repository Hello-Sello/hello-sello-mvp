'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type MultiSelectOption = { code: string; description: string }

/**
 * Dropdown multi-select used by the onboarding company step for the two-level
 * business taxonomy (Business Category + Business Activities, DEV-99 #3).
 *
 * A closed summary bar shows the picked options (or a placeholder); clicking it
 * opens a checkbox panel. The panel closes on outside-click or Escape, but stays
 * open while options are toggled — the caller keeps selection in a Set it owns.
 *
 * Custom option: pass `customCode` to make one option reveal an inline free-text
 * box *inside the panel* when ticked (e.g. Category → "Custom"). The text lives in
 * the panel deliberately, so typing a custom name never closes the dropdown. The
 * caller owns the label string via `customLabel` / `onCustomLabelChange`, and the
 * summary shows the typed value in quotes.
 */
export function MultiSelect({
  label,
  required = false,
  options,
  selected,
  onToggle,
  placeholder,
  invalid = false,
  errorText,
  customCode,
  customLabel = '',
  onCustomLabelChange,
  customPlaceholder = 'Type your own…',
}: {
  label: string
  required?: boolean
  options: MultiSelectOption[]
  selected: Set<string>
  onToggle: (code: string) => void
  placeholder: string
  invalid?: boolean
  errorText?: string
  customCode?: string
  customLabel?: string
  onCustomLabelChange?: (value: string) => void
  customPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const customSelected = customCode !== undefined && selected.has(customCode)

  // Close on any click outside this control, and on Escape. Only wired while open.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The closed bar: each picked code as its description; the custom code as its
  // typed value (quoted) or a "Custom…" stand-in until named.
  const summary = [...selected]
    .map((code) => {
      if (code === customCode) {
        const t = customLabel.trim()
        return t ? `“${t}”` : 'Custom…'
      }
      return options.find((o) => o.code === code)?.description ?? code
    })
    .join(', ')

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink-muted">
        {label}
        {required && <span className="ml-0.5 font-semibold text-brand">*</span>}
      </span>

      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white/70 px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-brand-soft ${
            invalid
              ? 'border-danger focus:border-danger'
              : open
                ? 'border-brand'
                : 'border-white/70 focus:border-brand'
          }`}
        >
          <span className={`min-w-0 flex-1 truncate ${summary ? 'text-ink' : 'text-ink-muted'}`}>
            {summary || placeholder}
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            id={panelId}
            role="listbox"
            aria-multiselectable
            aria-label={label}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_14px_30px_-12px_rgba(122,22,56,0.28)]"
          >
            {options.map((o) => {
              const isCustom = o.code === customCode
              return (
                <div key={o.code}>
                  <label
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-brand-soft/30 ${
                      isCustom ? 'mt-1 border-t border-dashed border-ink/15 pt-2.5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(o.code)}
                      onChange={() => onToggle(o.code)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className={isCustom ? 'italic text-ink-muted' : 'text-ink'}>
                      {o.description}
                    </span>
                  </label>
                  {isCustom && customSelected && (
                    <div className="px-2.5 pb-2 pl-10 pt-1">
                      <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => onCustomLabelChange?.(e.target.value)}
                        placeholder={customPlaceholder}
                        autoFocus
                        className="w-full rounded-lg border border-white/70 bg-white/70 px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {invalid && errorText && <p className="text-xs text-danger">{errorText}</p>}
    </div>
  )
}
