'use client'

import { useState } from 'react'
import { Camera, Check } from 'lucide-react'
import { createClient } from '@/shared/db/client'
import { Avatar } from './Avatar'

/**
 * Pick + upload an avatar straight from the browser to the public `avatars`
 * bucket (client-direct — avoids the Server-Action body limit), then hand the
 * stored path to `onSaved` so the caller can persist the pointer. Reused by the
 * account page (and later onboarding).
 */
export function AvatarUpload({
  personId,
  name,
  initialUrl,
  onSaved,
}: {
  personId: string
  name: string
  initialUrl: string | null
  onSaved: (path: string) => Promise<{ error?: string }>
}) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Avatar saves instantly on pick (client-direct upload). `saved` surfaces a
  // visible "Photo updated" confirmation so the instant save isn't silent —
  // matching the explicit Saved feedback the rest of the profile form gives.
  const [saved, setSaved] = useState(false)

  async function pick(file: File) {
    setBusy(true)
    setError(null)
    setSaved(false)
    const supabase = createClient()
    // Stable per-person path so `upsert` overwrites the one avatar file instead
    // of orphaning the old one. (A random filename never collides, so the old
    // upsert flag was dead and every change left an orphan behind.)
    const path = `${personId}/avatar`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const res = await onSaved(path)
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    // The public URL is now stable, so the browser would show the cached old
    // image. Preview the bytes we just uploaded directly; other viewers get the
    // fresh image via the `?v=updated_at` nonce on read + Smart CDN invalidation.
    setUrl(URL.createObjectURL(file))
    setSaved(true)
    setBusy(false)
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar url={url} name={name} size={76} />
      <div className="flex flex-col gap-1">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand-soft/20">
          <Camera size={15} /> {busy ? 'Uploading…' : 'Change photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pick(f)
              e.target.value = ''
            }}
          />
        </label>
        {error && <span className="text-xs text-danger">{error}</span>}
        {saved && !busy && !error && (
          <span className="inline-flex items-center gap-1 text-xs text-success"><Check size={13} /> Photo updated</span>
        )}
      </div>
    </div>
  )
}
