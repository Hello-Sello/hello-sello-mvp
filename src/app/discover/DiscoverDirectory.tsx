"use client";

/**
 * Discover — a CLOSED, TAGGED company directory. A NON-marketplace: you search
 * and filter the directory, see each company as a brand line (logo · name ·
 * category · country), and request entry. A company's shop stays hidden until
 * they let you in — so this page never shows products or prices.
 *
 * UI-only for now: data is placeholder (sample-companies) and "Request to enter"
 * is a stub. The real listing RPC and the gate's accept flow land later
 * (see docs/build/discover-directory.md).
 */
import { useState } from "react";
import {
  Lock, Search, Check,
  Leaf, Sprout, Snowflake, Warehouse, Boxes, Truck, Ship, Anchor,
  Pill, Cross, Mountain, Globe, Sun, Flame,
} from "lucide-react";
import {
  COMPANIES, CATEGORIES, COUNTRIES,
  type Company, type Category, type LogoGlyph,
} from "./sample-companies";

const GLYPHS: Record<LogoGlyph, typeof Leaf> = {
  leaf: Leaf, sprout: Sprout, snow: Snowflake, warehouse: Warehouse, boxes: Boxes,
  truck: Truck, ship: Ship, anchor: Anchor, pill: Pill, cross: Cross,
  mountain: Mountain, globe: Globe, sun: Sun, flame: Flame,
};

// A glossy tinted tile + a white brand glyph stands in for a real uploaded logo.
function Logo({ c, size = 48 }: { c: Company; size?: number }) {
  const Glyph = GLYPHS[c.glyph];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, rgba(255,255,255,0.28), transparent 55%), ${c.tint}`,
      }}
    >
      <Glyph size={size * 0.5} strokeWidth={2.2} />
    </span>
  );
}

function RequestButton({ requested, onRequest }: { requested: boolean; onRequest: () => void }) {
  return (
    <button
      onClick={onRequest}
      disabled={requested}
      className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
        requested ? "bg-success/15 text-success" : "bg-brand text-white hover:bg-brand-deep"
      }`}
    >
      {requested ? <><Check size={15} /> Requested</> : <><Lock size={14} /> Request to enter</>}
    </button>
  );
}

export function DiscoverDirectory() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");
  const [country, setCountry] = useState<string>("All");
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const list = COMPANIES.filter(
    (c) =>
      (cat === "All" || c.category === cat) &&
      (country === "All" || c.country === country) &&
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

      {/* category pills + country filter */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(["All", ...CATEGORIES] as const).map((c) => (
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
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-full bg-white/60 px-3 py-1.5 text-sm font-semibold text-ink/70"
        >
          <option value="All">All countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <p className="text-center text-xs font-medium text-ink/40">
        {list.length} {list.length === 1 ? "company" : "companies"}
      </p>

      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div key={c.id} className="glass flex items-center gap-4 rounded-2xl p-3">
            <Logo c={c} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-ink">{c.name}</div>
              <div className="text-sm text-ink/55">{c.category} · {c.country}</div>
            </div>
            <RequestButton
              requested={requested.has(c.id)}
              onRequest={() => setRequested((s) => new Set(s).add(c.id))}
            />
          </div>
        ))}
        {list.length === 0 && (
          <p className="py-10 text-center text-sm text-ink/40">No companies match your filters.</p>
        )}
      </div>
    </div>
  );
}
