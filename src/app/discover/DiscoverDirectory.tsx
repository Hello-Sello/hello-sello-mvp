"use client";

/**
 * Discover — a CLOSED, TAGGED company directory (NON-marketplace). You search
 * and filter the directory, see each company as a brand line (logo · name ·
 * category · country), and request entry.
 *
 * Data is real now: the page fetches `list_discoverable_companies` server-side
 * and passes it in. Filtering is client-side over the fetched set (fine for a
 * small directory; moves server-side when it grows). The button reflects the
 * viewer's per-card connection state — actually *sending* the request is the
 * next slice (Connect wiring), so `none` is an optimistic local stub for now.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Search, Check } from "lucide-react";
import type { DiscoverCompany, ConnectionState } from "./companies";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Deterministic tint per company, so a logo-less tile has a stable colour.
const TINTS = ["#34b233", "#6c7bd9", "#e30b5d", "#f59e0b", "#0ea5e9", "#8b5cf6",
  "#ef4444", "#14b8a6", "#ec4899", "#22c55e", "#a855f7", "#64748b"];
function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

// Real logo if the company uploaded one; otherwise a tinted initials tile.
function Logo({ company, size = 48 }: { company: DiscoverCompany; size?: number }) {
  if (company.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={company.logoUrl}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-cover ring-1 ring-black/5"
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size, height: size, fontSize: size * 0.34,
        background: `linear-gradient(135deg, rgba(255,255,255,0.28), transparent 55%), ${tintFor(company.name)}`,
      }}
    >
      {initials(company.name)}
    </span>
  );
}

function RequestButton({
  state, optimistic, onRequest,
}: { state: ConnectionState; optimistic: boolean; onRequest: () => void }) {
  if (state === "connected")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
        <Check size={15} /> Connected
      </span>
    );
  if (state === "incoming")
    return (
      <a href="/connect/inbox"
        className="rounded-full bg-brand-soft/60 px-4 py-2 text-sm font-bold text-brand-deep hover:bg-brand-soft">
        Wants to connect →
      </a>
    );
  if (state === "requested" || optimistic)
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
        <Check size={15} /> Requested
      </span>
    );
  return (
    <button onClick={onRequest}
      className="flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-deep">
      <Lock size={14} /> Request to enter
    </button>
  );
}

export function DiscoverDirectory({ companies }: { companies: DiscoverCompany[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [country, setCountry] = useState<string>("All");
  const [requested, setRequested] = useState<Set<string>>(new Set());

  // Filter options come from the data, so we only show categories/countries that exist.
  const categories = useMemo(
    () => Array.from(new Set(companies.flatMap((c) => c.categories))).sort(),
    [companies],
  );
  const countries = useMemo(
    () => Array.from(new Set(companies.map((c) => c.countryName))).sort(),
    [companies],
  );

  const list = companies.filter(
    (c) =>
      (cat === "All" || c.categories.includes(cat)) &&
      (country === "All" || c.countryName === country) &&
      c.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-5 overflow-auto px-2 pb-6">
      <div className="pt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/50 px-3 py-1 text-xs font-semibold text-brand-deep">
          <Lock size={12} /> Closed network
        </span>
        <h1 className="mt-3 text-3xl font-bold text-ink">Find a company to connect with</h1>
        <p className="mt-1 text-sm text-ink/55">
          Search the directory, then request entry. Shops stay private until you&apos;re let in.
        </p>
      </div>

      <div className="glass flex items-center gap-2 rounded-full px-4 py-1">
        <Search size={18} className="text-ink/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies…"
          className="w-full bg-transparent py-2.5 text-base focus:outline-none"
        />
      </div>

      {/* category pills + country filter (derived from the data) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              cat === c ? "bg-brand text-white" : "bg-white/60 text-ink/70 hover:bg-white/90"
            }`}
          >
            {c}
          </button>
        ))}
        {countries.length > 1 && (
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-full bg-white/60 px-3 py-1.5 text-sm font-semibold text-ink/70"
          >
            <option value="All">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <p className="text-center text-xs font-medium text-ink/40">
        {list.length} {list.length === 1 ? "company" : "companies"}
      </p>

      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div key={c.id} className="glass flex items-center gap-4 rounded-2xl p-3">
            <Link href={`/discover/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
              <Logo company={c} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-ink hover:underline">{c.name}</div>
                <div className="text-sm text-ink/55">
                  {[c.categories.join(", "), c.countryName].filter(Boolean).join(" · ")}
                </div>
              </div>
            </Link>
            <RequestButton
              state={c.connectionState}
              optimistic={requested.has(c.id)}
              onRequest={() => setRequested((s) => new Set(s).add(c.id))}
            />
          </div>
        ))}
        {list.length === 0 && (
          <p className="py-10 text-center text-sm text-ink/40">
            {companies.length === 0
              ? "No companies listed yet."
              : "No companies match your filters."}
          </p>
        )}
      </div>
    </div>
  );
}
