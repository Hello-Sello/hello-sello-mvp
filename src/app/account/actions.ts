'use server'

import { revalidatePath } from 'next/cache'
import { updateMyProfile, setMyAvatarPath, type ProfileFields } from '@/modules/profile'
import { updateCompanyProfile, type CompanyFields } from '@/modules/companies'

// Thin server actions over the modules — the account UI calls these; the modules
// own the rules and storage shape.

export async function saveMyProfile(fields: ProfileFields) {
  const r = await updateMyProfile(fields)
  if (!r.error) revalidatePath('/account')
  return r
}

export async function saveCompanyProfile(fields: Partial<CompanyFields>) {
  const r = await updateCompanyProfile(fields)
  if (!r.error) revalidatePath('/account')
  return r
}

export async function saveAvatar(path: string) {
  const r = await setMyAvatarPath(path)
  if (!r.error) revalidatePath('/account')
  return r
}
