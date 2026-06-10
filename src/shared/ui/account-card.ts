'use server'

import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { getMyProfile } from '@/modules/profile'
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

  let qrSvg: string | null = null
  if (p.publicHandle) {
    const h = await headers()
    const host = h.get('host') ?? 'hello-sello.com'
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    qrSvg = await QRCode.toString(`${proto}://${host}/c/${p.publicHandle}`, { type: 'svg', margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
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
