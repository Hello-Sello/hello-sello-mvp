'use server'

import QRCode from 'qrcode'
import { getMyProfile, getPublicProfile, buildVCard } from '@/modules/profile'
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
  // fields as the public card's "Save contact"). Needs the PublicProfile shape,
  // so fetch it via the public handle rather than reusing getMyProfile's row.
  let qrSvg: string | null = null
  if (p.publicHandle) {
    const pub = await getPublicProfile(p.publicHandle)
    if (pub) {
      qrSvg = await QRCode.toString(buildVCard(pub), { type: 'svg', margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
    }
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
