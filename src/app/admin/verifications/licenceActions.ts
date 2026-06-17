'use server'

/**
 * licenceActions — server actions for the licence viewer.
 *
 * fetchLicenceUrls: generates short-TTL (60 s) signed URLs for all licence files
 * belonging to a company and logs license_viewed — both in one deliberate panel-open
 * action (Pitfall 6: once per deliberate view, not on every render).
 *
 * D-02 guarantee: ONLY createSignedUrl, short-TTL signed URLs — view-only, no public URLs.
 * T-03-08: grep gate asserts no forbidden access patterns in this directory.
 *
 * Fail-soft: if log_license_viewed fails, the signed URLs are still returned
 * so the viewer renders. A logging hiccup never blocks the review.
 */

import { createClient } from '@/shared/db/server'

type FetchResult =
  | { urls: Record<string, string> } // id → signedUrl
  | { error: string; urls: Record<string, string> } // partial — urls still returned

type LicenceFileMeta = {
  id: string
  storage_path: string
}

export async function fetchLicenceUrls(companyId: string): Promise<FetchResult> {
  const supabase = await createClient()

  // 1. Get the licence metadata rows (is_hs_team()-gated RPC).
  const { data: rows, error: rpcError } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: LicenceFileMeta[] | null; error: { message: string } | null }>
  }).rpc('get_company_licences', { p_company_id: companyId })

  if (rpcError) {
    return { error: rpcError.message, urls: {} }
  }

  const licenceRows: LicenceFileMeta[] = rows ?? []

  // 2. Generate short-TTL signed URLs for each file.
  //    60 s TTL — regenerated per deliberate view, NEVER stored (D-02 / T-03-08).
  const urlEntries = await Promise.all(
    licenceRows.map(async (row) => {
      const { data, error } = await supabase.storage
        .from('company-licenses')
        .createSignedUrl(row.storage_path, 60)
      if (error || !data?.signedUrl) return null
      return [row.id, data.signedUrl] as [string, string]
    }),
  )

  const urls: Record<string, string> = Object.fromEntries(
    urlEntries.filter((e): e is [string, string] => e !== null),
  )

  // 3. Log license_viewed once per deliberate open — fail-soft.
  //    A logging error is returned alongside the URLs so the viewer can show a
  //    non-blocking warning, but the viewer still renders (Pitfall 6 / T-03-12).
  let logError: string | undefined
  try {
    const { error: logRpcError } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    }).rpc('log_license_viewed', { p_company_id: companyId })
    if (logRpcError) {
      logError = logRpcError.message
    }
  } catch (err) {
    logError = err instanceof Error ? err.message : String(err)
  }

  if (logError) {
    return { error: logError, urls }
  }

  return { urls }
}
