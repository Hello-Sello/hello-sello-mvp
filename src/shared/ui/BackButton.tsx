'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { APP_LANDING } from './surfaces'

/**
 * Reusable back control. Goes to the previous page in history; if there's none
 * (e.g. the page was opened in a fresh tab), falls back to a safe destination.
 */
export function BackButton({ label = 'Back', fallback = APP_LANDING }: { label?: string; fallback?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(fallback)
      }}
      className="inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 text-sm font-medium text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-white"
    >
      <ArrowLeft size={16} /> {label}
    </button>
  )
}
