'use server'

import QRCode from 'qrcode'
import { getMyProfile, buildVCard, ensurePublicHandle } from '@/modules/profile'
import { getCompanyProfile } from '@/modules/companies'

export type AccountCard = {
  displayName: string
  title: string
  companyName: string
  handle: string | null
  avatarUrl: string | null
  qrSvg: string | null
} | null

// Data for the bottom-left account card popover. QR is rendered server-side so
// the qrcode library never ships to the browser bundle.
export async function getAccountCard(): Promise<AccountCard> {
  const p = await getMyProfile()
  if (!p) return null
  const c = await getCompanyProfile()

  // New signups only get a public_handle on their first profile save; assign one
  // now so every account (even a never-edited profile) is scan-able. The common
  // case (handle already set) skips the extra write.
  const handle = p.publicHandle ?? (await ensurePublicHandle(p.displayName))

  // QR encodes the vCard itself so scanning opens "Add Contact" directly (same
  // fields as the public card's "Save contact"). Built in-memory from the profile
  // + company already fetched — no extra RPC. Rendered unconditionally so the
  // "SCAN TO CONNECT" QR always appears (handles are assigned lazily, not auto).
  const vcard = buildVCard({
    displayName: p.displayName,
    title: p.title,
    email: p.email,
    phone: p.phone,
    linkedin: p.linkedin,
    company: c ? { name: c.name, website: c.website } : null,
  })
  const qrSvg = await QRCode.toString(vcard, { type: 'svg', margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })

  return {
    displayName: p.displayName,
    title: p.title,
    companyName: c?.name ?? '',
    handle,
    avatarUrl: p.avatarUrl,
    qrSvg,
  }
}
