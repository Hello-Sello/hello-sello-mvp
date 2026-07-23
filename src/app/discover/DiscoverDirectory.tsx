"use client";

/**
 * Discover — a CLOSED, TAGGED company directory (NON-marketplace), redesigned to
 * Marcel's spec (Variant A "Editorial", D-01/03/04/12/13/14/15). Full-width
 * 3-zone band over an unstacked row list. Filtering is multi-select and
 * client-side over the fetched set (OR within a group, AND across groups); it
 * moves server-side when the directory grows.
 *
 * D-12 PHARMACY LISTING GATE — CLIENT-SIDE v1 (conscious tradeoff, T-06-08):
 * "Listed" = the company has a seller-side type (Cultivator / Wholesaler /
 * Importer). Pharmacy-ONLY companies are HIDDEN from the default list and shown
 * only when the exact-name search matches, badged "Found by search · not listed".
 * This gate is presentation-only — the `list_discoverable_companies` RPC returns
 * all verified peers, so a caller reading the RPC directly still sees pharmacy-only
 * rows. ACCEPTABLE for v1: every returned company is a verified peer in the same
 * closed network and the exposed fields are directory-safe (name/logo/country/
 * city/type); shop + pricing stay behind `get_discoverable_shop`'s server gate.
 * HARDENING FOLLOW-UP = push the listing gate + name-search server-side (folds
 * into the deferred server-side-filter + keyset-pagination item). See companies.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Check, ChevronDown, ArrowRight, X, Lock } from "lucide-react";
import type { DiscoverCompany, ConnectionState } from "./companies";
import { COUNTRIES } from "@/shared/geo/countries";
import { sendConnectRequest } from "./actions";
import { VerifiedBadge } from "@/shared/ui/VerifiedBadge";
import { SELLER_TYPE_LABELS, isListedCompany } from "./taxonomy";

// The non-pharmacy activity labels drive the type facets (post-taxonomy migration).
const SELLER_TYPES = SELLER_TYPE_LABELS;

// A company is listed by default unless it is pharmacy-ONLY; pharmacy-only
// companies are hidden and search-only (DISC-3).
const isListed = (c: DiscoverCompany) => isListedCompany(c.categories);

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
// The outer span is `relative` so the form-G verified tick anchors to the logo
// corner. The tick is UNCONDITIONAL — the Discover RPC hard-filters
// `verification_status='verified'`, so every row is verified by construction
// (do NOT thread a status field through DiscoverCompany — see RESEARCH Anti-Pattern).
function Logo({ company, size = 48 }: { company: DiscoverCompany; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={company.logoUrl}
          alt=""
          style={{ width: size, height: size }}
          className="rounded-2xl object-cover ring-1 ring-black/5"
        />
      ) : (
        <span
          className="flex items-center justify-center rounded-2xl font-bold text-white shadow-sm ring-1 ring-black/5"
          style={{
            width: size, height: size, fontSize: size * 0.34,
            background: `linear-gradient(140deg, rgba(255,255,255,0.28), transparent 55%), ${tintFor(company.name)}`,
          }}
        >
          {initials(company.name)}
        </span>
      )}
      <VerifiedBadge status="verified" variant="tick" />
    </span>
  );
}

// 2-letter ISO code chip (D-13 aesthetic — no emoji flags).
const CodeChip = ({ code }: { code: string }) => (
  <span className="inline-flex h-5 min-w-[26px] items-center justify-center rounded-md bg-brand-soft/40 px-1 text-[10px] font-bold tracking-wide text-brand-deep">
    {code.toUpperCase()}
  </span>
);

const tagChip = (t: string) => (
  <span key={t} className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-ink-muted ring-1 ring-black/5">
    {t}
  </span>
);

/**
 * State-aware Connect CTA (D-15): copy "Connect", no lock icon, premium styling.
 * Four states preserved: connected / incoming "Wants to connect" / requested / none.
 * `none` fires the REAL `sendConnectRequest` server action (creates a `connect`
 * inbox item) with an optimistic flip + rollback on error.
 */
function ConnectButton({ company }: { company: DiscoverCompany }) {
  const [optimistic, setOptimistic] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const state: ConnectionState = company.connectionState;

  if (state === "connected")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
        <Check size={15} /> Connected
      </span>
    );
  if (state === "incoming")
    return (
      <a href="/connect/inbox"
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/60 px-4 py-2 text-sm font-semibold text-brand-deep hover:bg-brand-soft">
        Wants to connect <ArrowRight size={14} />
      </a>
    );
  if (state === "requested" || optimistic)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-semibold text-success">
        <Check size={15} /> Requested
      </span>
    );

  async function onConnect() {
    setErr(null);
    setSending(true);
    setOptimistic(true);
    const res = await sendConnectRequest(company.id, "");
    setSending(false);
    if ("error" in res) {
      setOptimistic(false); // rollback — the send did not persist
      setErr(res.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onConnect}
        disabled={sending}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand/30 ring-1 ring-brand-deep/20 transition hover:bg-brand-deep disabled:opacity-60"
        style={{ backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 60%)" }}
      >
        Connect <ArrowRight size={15} />
      </button>
      {err && <span className="text-[11px] font-medium text-danger">{err}</span>}
    </div>
  );
}

export function DiscoverDirectory({ companies }: { companies: DiscoverCompany[] }) {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Set<string>>(new Set()); // ISO codes
  const [ctyOpen, setCtyOpen] = useState(false);
  const [ctyQ, setCtyQ] = useState("");
  const ctyWrap = useRef<HTMLDivElement>(null);

  // Close the country dropdown on outside click.
  useEffect(() => {
    if (!ctyOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ctyWrap.current && !ctyWrap.current.contains(e.target as Node)) setCtyOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ctyOpen]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  // Count of listed companies per seller-side type (badge on each type pill).
  const countOfType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of SELLER_TYPES)
      m[t] = companies.filter((c) => isListed(c) && c.categories.includes(t)).length;
    return m;
  }, [companies]);

  // Filter: name search + multi-select (OR within group, AND across groups),
  // plus the D-12 pharmacy gate (hidden unless exact-name searched).
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return companies.filter((c) => {
      const nameOk = query === "" || c.name.toLowerCase().includes(query);
      if (!nameOk) return false;
      if (!isListed(c)) return query !== ""; // pharmacy-only → name search only
      const typeOk = types.size === 0 || c.categories.some((t) => types.has(t));
      const countryOk = countries.size === 0 || countries.has(c.countryCode);
      return typeOk && countryOk;
    });
  }, [companies, q, types, countries]);

  // Country dropdown options from the canonical ISO list (D-14), name-searchable.
  const countryOptions = useMemo(() => {
    const cq = ctyQ.trim().toLowerCase();
    return Object.entries(COUNTRIES)
      .filter(([, name]) => cq === "" || name.toLowerCase().includes(cq))
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [ctyQ]);

  const ctyLabel = countries.size === 0
    ? "All countries"
    : `${countries.size} ${countries.size === 1 ? "country" : "countries"}`;

  const hasActive = types.size > 0 || countries.size > 0;

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-auto px-4 py-8 sm:px-6">
      {/* CENTER zone: closed-network badge + title + intro + search */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/50 px-3 py-1 text-xs font-semibold text-brand-deep">
          <Lock size={13} /> Closed network
        </span>
        <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-tight text-ink sm:text-4xl">
          Find a company to connect with
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-muted">
          Search the directory, then request entry. Shops stay private until you&apos;re let in.
        </p>
        <div className="glass mx-auto mt-5 flex max-w-xl items-center gap-2.5 rounded-full px-4 py-1.5">
          <Search size={18} className="text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies by name…"
            className="w-full bg-transparent py-2.5 text-[15px] focus:outline-none"
          />
        </div>
      </div>

      {/* FILTER band: LEFT type-bubbles · RIGHT country multi-select */}
      <div className="mt-7 flex flex-col items-stretch gap-3 border-t border-white/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Company type
          </span>
          {SELLER_TYPES.map((t) => {
            const on = types.has(t);
            return (
              <button
                key={t}
                onClick={() => setTypes((s) => toggle(s, t))}
                className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  on ? "bg-brand text-white hover:bg-brand-deep"
                     : "bg-white/70 text-ink-muted ring-1 ring-black/5 hover:bg-white/90"
                }`}
              >
                {t}
                <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-bold ${
                  on ? "bg-white/25 text-white" : "bg-black/5 text-ink-muted"
                }`}>
                  {countOfType[t]}
                </span>
                {on && <Check size={13} className="ml-1.5" />}
              </button>
            );
          })}
        </div>

        {/* RIGHT zone: searchable multi-select country dropdown */}
        <div className="relative sm:w-56" ref={ctyWrap}>
          <button
            onClick={() => setCtyOpen((o) => !o)}
            className={`inline-flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              countries.size ? "bg-brand text-white hover:bg-brand-deep"
                             : "bg-white/70 text-ink-muted ring-1 ring-black/5 hover:bg-white/90"
            }`}
          >
            <span className="inline-flex items-center gap-1.5"><MapPin size={15} /> {ctyLabel}</span>
            <ChevronDown size={16} />
          </button>
          {ctyOpen && (
            <div className="glass-strong absolute right-0 z-30 mt-2 w-64 rounded-2xl p-2">
              <div className="mb-1 flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 text-ink-muted ring-1 ring-black/5">
                <Search size={15} />
                <input
                  value={ctyQ}
                  onChange={(e) => setCtyQ(e.target.value)}
                  placeholder="Search country…"
                  className="w-full bg-transparent text-sm text-ink focus:outline-none"
                />
              </div>
              <div className="max-h-60 overflow-auto">
                {countryOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-ink-muted">No match.</p>
                ) : (
                  countryOptions.map(([code, name]) => {
                    const on = countries.has(code);
                    return (
                      <button
                        key={code}
                        onClick={() => setCountries((s) => toggle(s, code))}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-brand-soft/25"
                      >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                          on ? "border-brand bg-brand text-white" : "border-black/15 bg-white text-transparent"
                        }`}>
                          <Check size={12} />
                        </span>
                        <CodeChip code={code} />
                        <span className="font-medium text-ink">{name}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {countries.size > 0 && (
                <button
                  onClick={() => setCountries(new Set())}
                  className="mt-1 w-full rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-brand hover:bg-brand-soft/30"
                >
                  Clear {countries.size} selected
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ACTIVE filter chip bar (removable) */}
      {hasActive && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Active</span>
          {[...types].map((t) => (
            <button
              key={`t-${t}`}
              onClick={() => setTypes((s) => toggle(s, t))}
              className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-deep"
            >
              {t} <X size={12} />
            </button>
          ))}
          {[...countries].map((code) => (
            <button
              key={`c-${code}`}
              onClick={() => setCountries((s) => toggle(s, code))}
              className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-deep"
            >
              <CodeChip code={code} /> {COUNTRIES[code] ?? code} <X size={12} />
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 mt-6 px-0.5 text-sm">
        <span className="font-bold text-ink">{list.length}</span>{" "}
        <span className="text-ink-muted">{list.length === 1 ? "company" : "companies"}</span>
      </div>

      {/* Full-width UNSTACKED rows: logo · name · location · tags · Connect */}
      <div className="flex flex-col gap-2.5">
        {list.map((c) => {
          const hidden = !isListed(c);
          const location = [c.city, c.countryName].filter(Boolean).join(", ");
          return (
            <div
              key={c.id}
              className="glass grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl px-4 py-3 transition hover:bg-white/80 sm:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.9fr)_auto]"
            >
              <Link href={`/discover/${c.id}`} className="shrink-0">
                <Logo company={c} />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/discover/${c.id}`} className="truncate font-bold text-ink hover:underline">
                    {c.name}
                  </Link>
                  {hidden && (
                    <span className="shrink-0 rounded-full bg-brand-soft/40 px-2 py-0.5 text-[10px] font-bold text-brand-deep ring-1 ring-brand-soft">
                      Found by search · not listed
                    </span>
                  )}
                </div>
                {/* mobile: location + tags collapse into the name cell */}
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted sm:hidden">
                  <MapPin size={13} /> {[location, c.categories.join(", ")].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="hidden items-center gap-1.5 text-sm text-ink-muted sm:flex">
                {location && <><MapPin size={14} /> {location}</>}
              </div>
              <div className="hidden flex-wrap gap-1.5 sm:flex">
                {c.categories.map(tagChip)}
              </div>
              <ConnectButton company={c} />
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-muted">
            {companies.length === 0
              ? "No companies listed yet."
              : "No companies match your filters."}
          </p>
        )}
      </div>
    </div>
  );
}
