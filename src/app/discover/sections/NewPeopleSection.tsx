"use client";

/**
 * NewPeopleSection — the "People you may know" square-card grid (DISC-9), built to
 * the approved Variant D prototype (cover strip → circle avatar → name → title ·
 * company → a state-aware "+ Connect"). The card "+" fires the real
 * sendPersonConnectRequest (DISC-10) with optimistic pending off connection_state.
 *
 * Pharmacy gate: a person whose company is pharmacy-ONLY is hidden (there is no
 * people search in Variant D, so this section simply omits them — companies keep
 * the search-only reveal).
 */
import { useState } from "react";
import { Plus, Check, Users } from "lucide-react";
import type { DiscoverPerson } from "../people";
import { sendPersonConnectRequest } from "../personActions";
import { isListedCompany } from "../taxonomy";

const TINTS = ["#34b233", "#6c7bd9", "#e30b5d", "#f59e0b", "#0ea5e9", "#8b5cf6",
  "#ef4444", "#14b8a6", "#ec4899", "#22c55e", "#a855f7", "#64748b"];
function tintFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Avatar({ person, size = 72 }: { person: DiscoverPerson; size?: number }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.avatarUrl}
      alt=""
      style={{ width: size, height: size }}
      className="-mt-9 rounded-full border-[3px] border-white object-cover shadow-md"
    />
  ) : (
    <span
      className="-mt-9 flex items-center justify-center rounded-full border-[3px] border-white font-bold text-white shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.32, background: tintFor(person.name) }}
    >
      {initials(person.name)}
    </span>
  );
}

/** State-aware person Connect CTA — mirrors the company one, for the person graph. */
function PersonConnectButton({ person }: { person: DiscoverPerson }) {
  const [optimistic, setOptimistic] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const state = person.connectionState;

  if (state === "connected")
    return (
      <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
        <Check size={15} /> Connected
      </span>
    );
  if (state === "incoming")
    return (
      <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-soft/60 px-4 py-2 text-sm font-semibold text-brand-deep">
        Wants to connect
      </span>
    );
  if (state === "requested" || optimistic)
    return (
      <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-success/15 px-4 py-2 text-sm font-semibold text-success">
        <Check size={15} /> Pending
      </span>
    );

  async function onConnect() {
    setErr(null);
    setSending(true);
    setOptimistic(true);
    const res = await sendPersonConnectRequest(person.personId);
    setSending(false);
    if ("error" in res) {
      setOptimistic(false); // rollback — did not persist
      setErr(res.error);
    }
  }

  return (
    <div className="mt-3 w-full">
      <button
        onClick={onConnect}
        disabled={sending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-brand-deep ring-1 ring-brand-soft transition hover:bg-brand-soft/40 disabled:opacity-60"
      >
        <Plus size={15} /> Connect
      </button>
      {err && <span className="mt-1 block text-center text-[11px] font-medium text-danger">{err}</span>}
    </div>
  );
}

function PersonCard({ person }: { person: DiscoverPerson }) {
  const subtitle = [person.title, person.companyName].filter(Boolean).join(" · ");
  return (
    <div className="glass relative flex flex-col overflow-hidden rounded-xl transition hover:-translate-y-0.5 hover:bg-white/90">
      <div
        className="h-14"
        style={{ background: `linear-gradient(120deg, ${tintFor(person.companyName ?? person.name)}22, ${tintFor(person.name)}33)` }}
      />
      <div className="flex flex-1 flex-col items-center px-3.5 pb-4 text-center">
        <Avatar person={person} />
        <div className="mt-2 font-bold leading-tight text-ink">{person.name}</div>
        <div className="mt-0.5 min-h-[32px] text-[12.5px] leading-snug text-ink-muted">{subtitle}</div>
        <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-ink-muted/70">
          <Users size={12} /> New to Hello Sello
        </div>
        <div className="mt-auto w-full">
          <PersonConnectButton person={person} />
        </div>
      </div>
    </div>
  );
}

export function NewPeopleSection({ people }: { people: DiscoverPerson[] }) {
  // Pharmacy gate: a person at a pharmacy-only company is hidden.
  const visible = people.filter((p) => isListedCompany(p.categories));
  if (visible.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold text-ink">People you may know</h2>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-ink-muted">{visible.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => (
          <PersonCard key={p.personId} person={p} />
        ))}
      </div>
    </section>
  );
}
