import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { Mail, Phone, Globe, Link2, Download, UserPlus, MapPin, Package } from 'lucide-react'
import { Avatar } from '@/shared/ui/Avatar'
import { BackButton } from '@/shared/ui/BackButton'
import { Wordmark } from '@/shared/ui/Wordmark'
import { VerifiedBadge } from '@/shared/ui/VerifiedBadge'
import { getPublicProfile } from '@/modules/profile'
import { getCurrentUser } from '@/shared/auth'

// The public profile page opened by scanning the QR. Chrome-free (AppShell skips
// it) and readable by anyone — the proxy treats /c/* as public. It pulls ONLY the
// curated card fields via the get_public_profile RPC.
export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await getPublicProfile(handle)
  if (!profile) notFound()

  const insider = !!(await getCurrentUser())

  // The QR must encode an absolute, scannable URL — build it from the request.
  const h = await headers()
  const host = h.get('host') ?? 'hello-sello.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const url = `${proto}://${host}/c/${handle}`
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })

  const co = profile.company
  const firstName = profile.displayName.split(' ')[0] || 'them'

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-brand-soft/30">
      <div className="flex h-12 items-center justify-between px-5 text-xs">
        {/* Back only for signed-in viewers — an outsider scanning the QR has no app to return to.
            Public viewers get the Hello Sello wordmark on the left, parallel to the right-side pill. */}
        {insider ? <BackButton label="Back" /> : <Wordmark />}
        <span className={`rounded-full px-3 py-1 font-medium ${insider ? 'bg-success/15 text-success' : 'bg-black/[0.05] text-ink-muted'}`}>
          {insider ? 'Signed in to Hello Sello' : 'Public profile'}
        </span>
      </div>

      <div className="relative h-44 w-full bg-gradient-to-br from-brand via-brand-deep to-brand-deep md:h-52">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        {co && (
          <div className="absolute bottom-4 left-6 right-6 text-white md:bottom-5">
            {co.tagline && <p className="text-sm/none opacity-80">{co.tagline}</p>}
            {/* Unlike Discover (every row verified by RPC), this card is anon-readable and
                shows ANY company — so the pill gates on the REAL status (component self-gates). */}
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold md:text-2xl">{co.name}</h2>
              <VerifiedBadge status={co.verificationStatus} variant="pill" />
            </div>
          </div>
        )}
      </div>

      {/* On mobile the card sits below the hero (banner stays visible); only md+ overlaps it. */}
      <main className="mx-auto mt-6 grid max-w-4xl grid-cols-1 gap-6 px-6 pb-16 md:-mt-10 md:grid-cols-[1.4fr_1fr]">
        <section className="glass-strong rounded-3xl p-7">
          <div className="flex items-center gap-4">
            <Avatar url={profile.avatarUrl} name={profile.displayName} size={88} />
            <div>
              <h1 className="text-xl font-bold text-ink">{profile.displayName}</h1>
              <p className="text-ink-muted">
                {profile.title}
                {co ? `${profile.title ? ' · ' : ''}${co.name}` : ''}
              </p>
            </div>
          </div>

          {co?.about && (
            <>
              <h3 className="mt-7 text-sm font-semibold text-ink">About {co.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{co.about}</p>
            </>
          )}

          {co && (co.products || co.country) && (
            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              {co.products && <Meta icon={Package} label="Products" value={co.products} />}
              {co.country && <Meta icon={MapPin} label="Location" value={co.country} />}
            </div>
          )}

          <h3 className="mt-7 text-sm font-semibold text-ink">Reach {firstName}</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {profile.email && <Contact icon={Mail} text={profile.email} />}
            {profile.phone && <Contact icon={Phone} text={profile.phone} />}
            {profile.linkedin && <Contact icon={Link2} text={profile.linkedin} />}
            {co?.website && <Contact icon={Globe} text={co.website} />}
          </ul>
        </section>

        <aside className="glass-strong rounded-3xl p-7 text-center md:flex md:flex-col md:justify-center">
          <div
            className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm [&>svg]:h-[150px] [&>svg]:w-[150px]"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 text-xs font-medium tracking-widest text-ink-muted">SCAN TO CONNECT</p>
          <div className="mt-5 flex flex-col gap-2.5">
            <a href={`/c/${handle}/vcard`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep">
              <Download size={17} /> Save contact
            </a>
            {insider ? (
              <button disabled className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 px-4 py-2.5 text-sm font-semibold text-brand/60">
                <UserPlus size={17} /> Connect <span className="rounded bg-brand-soft/40 px-1.5 py-0.5 text-[10px] text-brand-deep">soon</span>
              </button>
            ) : (
              <a href="/signup" className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft/20">
                <UserPlus size={17} /> Join Hello Sello to connect
              </a>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{`hello-sello.com/c/${handle}`}</p>
        </aside>
      </main>
    </div>
  )
}

function Meta({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-ink"><Icon size={14} className="text-brand" />{value}</p>
    </div>
  )
}
function Contact({ icon: Icon, text }: { icon: typeof Mail; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-3 py-2.5 text-sm text-ink">
      <Icon size={16} className="text-brand" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </li>
  )
}
