'use client'

/*
 * ============================================================================
 *  PROTOTYPE — THROWAWAY. Not production. Delete once built.
 * ============================================================================
 *  LOCKED designs only (2026-06-10):
 *    1. Public profile · Outsider   (signed-out — "Join to connect")
 *    2. Public profile · Insider    (signed-in — "Connect" + back to app)
 *    3. In-app · bottom-left card   (avatar popover → opens account pages)
 *    4. Account area                (My Profile / Company Profile / Settings)
 *
 *  Back buttons on navigated-into pages. Field edits PERSIST across navigation
 *  (held in the module-level `person`/`company` objects; the switcher uses
 *  history.replaceState so no reload wipes them). Faux data, faux QR.
 * ============================================================================
 */

import { useEffect, useState } from 'react'
import {
  Mail, Link2, Phone, Globe, Download, UserPlus, MapPin, ChevronLeft, ChevronRight,
  ArrowLeft, User, Building2, Settings, LogOut, Camera, Languages, Tag, Clock, Bell,
  Lock, Users, ExternalLink, Copy, Check,
} from 'lucide-react'
const Linkedin = Link2 // lucide dropped brand icons

// Mutable module-level stores → edits persist while the prototype stays mounted.
const person = {
  name: 'Marcel Riggs', title: 'Commercial Director', phone: '+49 171 234 5678',
  language: 'English', linkedin: 'linkedin.com/in/marcel-riggs',
  email: 'marcel.riggs@hello-sello.com', initials: 'MR',
  photo: 'https://i.pravatar.cc/240?img=12', handle: 'marcel-riggs', company: 'Hello Sello GmbH',
}
const company = {
  name: 'Hello Sello GmbH', country: 'Germany', tagline: 'Medical cannabis distribution — Germany & EU',
  about: 'A licensed distributor connecting cultivators and pharmacies across the EU. GMP/GDP compliant logistics, lab-verified product, fast settlement.',
  products: 'Dried flower · Extracts · Lab services', location: 'Berlin, Germany',
  address: 'Friedrichstraße 12, 10117 Berlin', website: 'hello-sello.com',
  categories: ['wholesaler', 'cultivator'],
  description: 'A licensed distributor connecting cultivators and pharmacies across the EU.',
}
type Nav = (key: string) => void

function FauxQR({ size = 150 }: { size?: number }) {
  const n = 21, cell = size / n
  const mod = (r: number, c: number) => ((r * 31 + c * 17 + r * c * 7) % 11) > 4
  const fnd = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
  const cells = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fnd(r, c) && mod(r, c)) cells.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#0a0a0a" />)
  const F = ({ x, y }: { x: number; y: number }) => (<g transform={`translate(${x},${y})`}><rect width={cell * 6} height={cell * 6} fill="#0a0a0a" /><rect x={cell} y={cell} width={cell * 4} height={cell * 4} fill="#fff" /><rect x={cell * 2} y={cell * 2} width={cell * 2} height={cell * 2} fill="#0a0a0a" /></g>)
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded"><rect width={size} height={size} fill="#fff" />{cells}<F x={0} y={0} /><F x={cell * (n - 6)} y={0} /><F x={0} y={cell * (n - 6)} /></svg>
}
function Avatar({ size }: { size: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-brand/70" style={{ width: size, height: size }}>
      <span className="absolute inset-0 flex items-center justify-center bg-brand font-semibold text-white" style={{ fontSize: size * 0.34 }}>{person.initials}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={person.photo} alt={person.name} className="relative h-full w-full object-cover" />
    </span>
  )
}
function BackBtn({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 text-sm font-medium text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-white"><ArrowLeft size={16} /> {label}</button>
}
function ContactRow({ icon: Icon, text }: { icon: typeof Mail; text: string }) {
  return <li className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-3 py-2.5 text-sm text-ink"><Icon size={16} className="text-brand" /><span className="min-w-0 flex-1 truncate">{text}</span></li>
}
function Meta({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Mail }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-0.5 flex items-center gap-1 text-ink">{Icon && <Icon size={14} className="text-brand" />}{value}</p></div>
}
function BtnPrimary({ children }: { children: React.ReactNode }) { return <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep">{children}</button> }

// ============================ 1+2 — PUBLIC PROFILE ===========================
function PublicProfile({ viewer, nav }: { viewer: 'outsider' | 'insider'; nav?: Nav }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-brand-soft/30">
      <div className="flex h-10 items-center justify-between px-5 text-xs">
        {viewer === 'insider' && nav ? <BackBtn onClick={() => nav('3')} label="Back to Hello Sello" /> : <span />}
        {viewer === 'insider'
          ? <span className="rounded-full bg-success/15 px-3 py-1 font-medium text-success">Signed in as Aurora Deutschland GmbH</span>
          : <span className="rounded-full bg-black/[0.05] px-3 py-1 font-medium text-ink-muted">Public profile · not signed in</span>}
      </div>
      <div className="relative h-52 w-full bg-gradient-to-br from-brand via-brand-deep to-[#3a0016]">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="absolute bottom-5 left-6 right-6 text-white"><p className="text-sm/none opacity-80">{company.tagline}</p><h2 className="mt-1 text-2xl font-bold">{company.name}</h2></div>
      </div>
      <main className="mx-auto -mt-10 grid max-w-4xl grid-cols-1 gap-6 px-6 pb-16 md:grid-cols-[1.4fr_1fr]">
        <section className="glass-strong rounded-3xl p-7">
          <div className="flex items-center gap-4"><Avatar size={88} /><div><h1 className="text-xl font-bold text-ink">{person.name}</h1><p className="text-ink-muted">{person.title} · {person.company}</p></div></div>
          <h3 className="mt-7 text-sm font-semibold text-ink">About {company.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{company.about}</p>
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm"><Meta label="Products" value={company.products} /><Meta label="Location" value={company.location} icon={MapPin} /></div>
          <h3 className="mt-7 text-sm font-semibold text-ink">Reach {person.name.split(' ')[0]}</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <ContactRow icon={Mail} text={person.email} /><ContactRow icon={Phone} text={person.phone} />
            <ContactRow icon={Linkedin} text={person.linkedin} /><ContactRow icon={Globe} text={person.website} />
          </ul>
        </section>
        <aside className="glass-strong rounded-3xl p-7 text-center md:flex md:flex-col md:justify-center">
          <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm"><FauxQR size={150} /></div>
          <p className="mt-2 text-xs font-medium tracking-widest text-ink-muted">SCAN TO CONNECT</p>
          <div className="mt-5 flex flex-col gap-2.5">
            <BtnPrimary><Download size={17} /> Save contact</BtnPrimary>
            {viewer === 'outsider'
              ? <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 px-4 py-2.5 text-sm font-semibold text-brand"><UserPlus size={17} /> Join Hello Sello to connect</button>
              : <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 px-4 py-2.5 text-sm font-semibold text-brand/70"><UserPlus size={17} /> Connect <span className="rounded bg-brand-soft/40 px-1.5 py-0.5 text-[10px] text-brand-deep">soon</span></button>}
          </div>
          <p className="mt-3 text-xs text-ink-muted">hello-sello.com/c/{person.handle}</p>
          <p className="mt-3 text-[11px] leading-snug text-ink-muted">{viewer === 'outsider' ? 'A stranger can always save your contact; connecting needs an account.' : 'Connect fires a request to the company inbox — wiring ships with Connect (Ayush).'}</p>
        </aside>
      </main>
    </div>
  )
}

// ============================ 3 — IN-APP bottom-left card ====================
const RAIL = ['Home', 'Connect', 'Discover', 'Present', 'Buy', 'Sell', 'Trade']
function Placement({ nav }: { nav: Nav }) {
  const Item = ({ icon: Icon, label, onClick, danger }: { icon: typeof User; label: string; onClick?: () => void; danger?: boolean }) => (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-black/[0.04] ${danger ? 'text-brand' : 'text-ink'}`}><Icon size={16} /> {label}</button>
  )
  return (
    <div className="relative min-h-screen w-full bg-gradient-to-b from-white to-brand-soft/30">
      <div className="fixed inset-y-0 left-0 z-[61] flex w-[84px] flex-col items-center justify-between border-r border-white/60 bg-white/50 py-4 backdrop-blur">
        <div className="flex flex-col items-center gap-3">
          <div className="text-[11px] font-black leading-none text-brand">He//o<br />se//o</div>
          {RAIL.map((r, i) => <div key={r} className={`flex flex-col items-center gap-1 ${i === 0 ? 'text-brand' : 'text-ink-muted'}`}><span className={`h-7 w-7 rounded-lg ${i === 0 ? 'bg-brand/15' : 'bg-black/[0.04]'}`} /><span className="text-[10px]">{r}</span></div>)}
        </div>
        <div className="relative">
          <span className="rounded-full"><Avatar size={40} /></span>
          <div className="absolute bottom-0 left-12 z-40 w-72 rounded-3xl bg-white/95 p-6 text-center shadow-2xl ring-1 ring-black/5">
            <div className="flex justify-center"><Avatar size={64} /></div>
            <h3 className="mt-3 text-base font-bold text-ink">{person.name}</h3>
            <p className="text-sm text-ink-muted">{person.title}</p>
            <span className="mt-2 inline-block rounded-full border border-brand/40 px-3 py-0.5 text-xs font-semibold text-brand">{person.company}</span>
            <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5"><FauxQR size={110} /></div>
            <p className="mt-1.5 text-[10px] font-medium tracking-widest text-ink-muted">SCAN TO CONNECT</p>
            <div className="mt-4 space-y-1 border-t border-black/5 pt-3 text-left">
              <Item icon={User} label="My Profile" onClick={() => nav('4')} /><Item icon={Building2} label="Company Profile" onClick={() => nav('4')} /><Item icon={Settings} label="Settings" onClick={() => nav('4')} /><Item icon={LogOut} label="Sign Out" danger />
            </div>
          </div>
        </div>
      </div>
      <div className="pl-[84px]"><div className="flex min-h-screen items-center justify-center p-8"><p className="text-3xl font-bold text-ink/25">Hello <span className="text-brand/40">Marcel</span>, what are we doing next?</p></div></div>
    </div>
  )
}

// ============================ 4 — ACCOUNT AREA ==============================
type Tab = 'profile' | 'company' | 'settings'
const TITLES: Record<Tab, { h: string; p: string }> = {
  profile: { h: 'My Profile', p: 'How you appear on your card and to partners.' },
  company: { h: 'Company Profile', p: 'Your company details, shown on your public profile.' },
  settings: { h: 'Settings', p: 'Account, notifications, preferences, and team.' },
}
function AccountArea({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<Tab>('profile')
  const Item = ({ id, icon: Icon, label }: { id: Tab; icon: typeof User; label: string }) => (
    <button onClick={() => setTab(id)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${tab === id ? 'bg-brand text-white' : 'text-ink hover:bg-white/70'}`}><Icon size={16} /> {label}</button>
  )
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-brand-soft/30 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5"><BackBtn onClick={() => nav('3')} label="Back" /></div>
        <div className="flex gap-6">
          <nav className="glass-strong h-fit w-56 shrink-0 rounded-2xl p-3">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Account</p>
            <Item id="profile" icon={User} label="My Profile" /><Item id="company" icon={Building2} label="Company Profile" /><Item id="settings" icon={Settings} label="Settings" />
          </nav>
          <section className="glass-strong flex-1 rounded-3xl p-7">
            <h2 className="text-lg font-bold text-ink">{TITLES[tab].h}</h2>
            <p className="mb-6 text-sm text-ink-muted">{TITLES[tab].p}</p>
            {tab === 'profile' && <><MyProfileFields /><PublicProfileCallout /><SaveBar /></>}
            {tab === 'company' && <><CompanyFields /><SaveBar /></>}
            {tab === 'settings' && <SettingsFields />}
          </section>
        </div>
      </div>
    </div>
  )
}
function Field({ label, obj, k, icon: Icon }: { label: string; obj: Record<string, string>; k: string; icon?: typeof Mail }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="text-ink-muted">{label}</span><span className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink">{Icon && <Icon size={15} className="shrink-0 text-brand" />}<input defaultValue={obj[k]} onChange={(e) => { obj[k] = e.target.value }} className="w-full bg-transparent outline-none" /></span></label>
}
function MyProfileFields() {
  return (
    <>
      <div className="flex items-center gap-4"><Avatar size={76} /><button className="inline-flex items-center gap-2 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand"><Camera size={15} /> Change photo</button></div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Display name" obj={person} k="name" icon={User} /><Field label="Title / role" obj={person} k="title" />
        <Field label="Phone" obj={person} k="phone" icon={Phone} /><Field label="Language" obj={person} k="language" icon={Languages} />
        <Field label="LinkedIn" obj={person} k="linkedin" icon={Link2} />
        <label className="flex flex-col gap-1 text-sm"><span className="text-ink-muted">Email (sign-in)</span><span className="flex items-center gap-2 rounded-xl border border-white/50 bg-black/[0.03] px-3 py-2 text-ink-muted"><Mail size={15} /> {person.email}</span></label>
      </div>
    </>
  )
}
function CompanyFields() {
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft/40 text-brand"><Building2 size={22} /></span><h3 className="text-base font-semibold text-ink">{company.name}</h3></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-semibold text-info"><Clock size={13} /> Verification pending</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company name" obj={company} k="name" icon={Building2} /><Field label="Country" obj={company} k="country" icon={MapPin} />
        <Field label="Address" obj={company} k="address" icon={MapPin} /><Field label="Website" obj={company} k="website" icon={Globe} />
        <Field label="Primary products" obj={company} k="products" icon={Tag} />
        <label className="flex flex-col gap-1 text-sm"><span className="text-ink-muted">Business categories</span><span className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/70 bg-white/70 px-3 py-2">{company.categories.map((c) => <span key={c} className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium capitalize text-white">{c}</span>)}</span></label>
      </div>
      <label className="mt-4 flex flex-col gap-1 text-sm"><span className="text-ink-muted">Description</span><textarea defaultValue={company.description} onChange={(e) => { company.description = e.target.value }} rows={3} className="resize-none rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink outline-none" /></label>
    </>
  )
}
function PublicProfileCallout() {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl border border-brand/20 bg-brand-soft/10 p-4">
      <div className="rounded-lg bg-white p-1.5 shadow-sm"><FauxQR size={72} /></div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">Your public profile</p><p className="truncate text-xs text-ink-muted">hello-sello.com/c/{person.handle}</p></div>
      <button onClick={() => setCopied(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-brand/40 px-3 py-2 text-sm font-semibold text-brand">{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
      <button className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"><ExternalLink size={15} /> View</button>
    </div>
  )
}
function SaveBar() {
  return <div className="mt-7 flex items-center justify-end gap-3 border-t border-white/60 pt-4"><button className="text-sm font-medium text-ink-muted hover:text-ink">Cancel</button><button className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep">Save changes</button></div>
}
function Toggle({ on }: { on?: boolean }) {
  const [v, setV] = useState(!!on)
  return <button onClick={() => setV((x) => !x)} className={`relative h-6 w-11 rounded-full transition ${v ? 'bg-brand' : 'bg-black/15'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${v ? 'left-[22px]' : 'left-0.5'}`} /></button>
}
function SRow({ icon: Icon, label, sub, right }: { icon: typeof User; label: string; sub?: string; right: React.ReactNode }) {
  return <div className="flex items-center gap-3 px-1 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-ink-muted"><Icon size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{label}</p>{sub && <p className="text-xs text-ink-muted">{sub}</p>}</div><div className="shrink-0">{right}</div></div>
}
function SettingsFields() {
  const link = 'rounded-lg border border-brand/40 px-3 py-1.5 text-xs font-semibold text-brand'
  const soon = <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">soon</span>
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>
  return (
    <div className="flex flex-col gap-6">
      <section><H>Account</H><div className="divide-y divide-black/5">
        <SRow icon={Mail} label="Email" sub={person.email} right={<button className={link}>Change</button>} />
        <SRow icon={Lock} label="Password" sub="Last changed 3 months ago" right={<button className={link}>Change password</button>} />
        <SRow icon={Lock} label="Two-factor authentication" right={soon} />
      </div></section>
      <section><H>Notifications</H><div className="divide-y divide-black/5">
        <SRow icon={Bell} label="New connection requests" right={<Toggle on />} /><SRow icon={Bell} label="Deal updates" right={<Toggle on />} /><SRow icon={Bell} label="Product news" right={<Toggle />} />
      </div></section>
      <section><H>Preferences</H><div className="divide-y divide-black/5">
        <SRow icon={Languages} label="Language" right={<span className="text-sm text-ink-muted">English ▾</span>} />
        <SRow icon={Settings} label="Theme" sub="Light is the current platform theme" right={<span className="rounded-full bg-brand-soft/40 px-2.5 py-0.5 text-xs font-medium text-brand-deep">Light</span>} />
      </div></section>
      <section><H>Team &amp; permissions</H><div className="divide-y divide-black/5"><SRow icon={Users} label="Groups &amp; permissions" sub="Roles, who can do what (full matrix)" right={<ChevronRight size={18} className="text-ink-muted" />} /></div></section>
      <section className="rounded-2xl border border-danger/20 bg-danger/5 p-4"><button className="inline-flex items-center gap-2 text-sm font-semibold text-danger"><LogOut size={16} /> Sign out</button></section>
    </div>
  )
}

// ---- Switcher + route -------------------------------------------------------
const SCREENS = [
  { key: '1', name: 'Public profile · Outsider' },
  { key: '2', name: 'Public profile · Insider' },
  { key: '3', name: 'In-app · bottom-left card' },
  { key: '4', name: 'Account · Profile / Company / Settings' },
]
export default function LockedPrototype() {
  const [i, setI] = useState(0)
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('s'); const idx = SCREENS.findIndex((x) => x.key === v); if (idx >= 0) setI(idx) }, [])
  const go = (next: number) => { const n = (next + SCREENS.length) % SCREENS.length; setI(n); const url = new URL(window.location.href); url.searchParams.set('s', SCREENS[n].key); window.history.replaceState(null, '', url) }
  const navTo: Nav = (key) => { const idx = SCREENS.findIndex((s) => s.key === key); if (idx >= 0) go(idx) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (['INPUT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable) return; if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'ArrowRight') go(i + 1) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [i])
  const key = SCREENS[i].key
  return (
    <>
      <div className="fixed inset-0 z-[60] overflow-y-auto">
        {key === '1' && <PublicProfile viewer="outsider" />}
        {key === '2' && <PublicProfile viewer="insider" nav={navTo} />}
        {key === '3' && <Placement nav={navTo} />}
        {key === '4' && <AccountArea nav={navTo} />}
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-2 py-1.5 text-white shadow-2xl">
          <button onClick={() => go(i - 1)} className="rounded-full p-1.5 hover:bg-white/15"><ChevronLeft size={18} /></button>
          <span className="whitespace-nowrap px-3 text-sm font-medium"><span className="font-bold">{SCREENS[i].key}</span> · {SCREENS[i].name}</span>
          <button onClick={() => go(i + 1)} className="rounded-full p-1.5 hover:bg-white/15"><ChevronRight size={18} /></button>
        </div>
      )}
    </>
  )
}
