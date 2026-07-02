'use server'

import QRCode from 'qrcode'
import { getMyProfile, buildVCard } from '@/modules/profile'
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

  // QR encodes the vCard itself so scanning opens "Add Contact" directly (same
  // fields as the public card's "Save contact"). Built in-memory from the profile
  // + company already fetched — no extra RPC, and the QR always renders.
  let qrSvg: string | null = null
  if (p.publicHandle) {
    const vcard = buildVCard({
      displayName: p.displayName,
      title: p.title,
      email: p.email,
      phone: p.phone,
      linkedin: p.linkedin,
      company: c ? { name: c.name, website: c.website } : null,
    })
    qrSvg = await QRCode.toString(vcard, { type: 'svg', margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
  }

  return {
    displayName: p.displayName,
    title: p.title,
    companyName: c?.name ?? '',
    handle: p.publicHandle,
    avatarUrl: p.avatarUrl,
    qrSvg,
  }
}
