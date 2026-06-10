import { getPublicProfile, buildVCard } from '@/modules/profile'

// "Save contact" → downloads a vCard 3.0 (.vcf) built from the public profile.
// Works for anyone (no account) — same curated fields as the page.
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await getPublicProfile(handle)
  if (!profile) return new Response('Not found', { status: 404 })

  return new Response(buildVCard(profile), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${handle}.vcf"`,
    },
  })
}
