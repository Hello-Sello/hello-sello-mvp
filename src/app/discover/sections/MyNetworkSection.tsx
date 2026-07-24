"use client";

/**
 * MyNetworkSection — your connections, in TWO parts (DISC-14): connected
 * COMPANIES (from getMyConnections — the commercial graph) and connected PEOPLE
 * (from getMyPersonConnections — the social graph). Each person row has a Message
 * affordance that opens their company-less DM via /connect/chat?thread=<id>
 * (PG-13). Data is server-fetched and passed as props.
 */
import { useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, ChevronDown, Users } from "lucide-react";
import type { ConnectedCompany } from "@/modules/messaging/types";
import type { DiscoverPersonConnection } from "../personNetwork";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function CompanyRow({ company }: { company: ConnectedCompany }) {
  const [open, setOpen] = useState(false);
  const meta = [
    `${company.contactsCount} ${company.contactsCount === 1 ? "contact" : "contacts"}`,
    company.city,
  ].filter(Boolean).join(" · ");

  return (
    <div className="glass rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-xs font-bold text-brand-deep">
          {company.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-ink">{company.name}</div>
          <div className="flex items-center gap-1 truncate text-[13px] text-ink-muted">
            <MapPin size={12} /> {meta}
          </div>
        </div>
        {company.openDealCount > 0 && (
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
            {company.openDealCount} open
          </span>
        )}
        {company.people.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Show people"
            className="shrink-0 rounded-full p-1 text-ink-muted transition hover:bg-black/5"
          >
            <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
          </button>
        )}
      </div>
      {open && company.people.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-black/5 pt-2">
          {company.people.map((p) => (
            <span key={p.personId} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs text-ink-muted ring-1 ring-black/5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-info/20 text-[9px] font-bold text-info">{p.initials}</span>
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: DiscoverPersonConnection }) {
  const subtitle = [person.title, person.companyName].filter(Boolean).join(" · ");
  return (
    <div className="glass flex items-center gap-3 rounded-xl px-3.5 py-2.5">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/20 text-xs font-bold text-info">
          {initials(person.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-ink">{person.name}</div>
        {subtitle && <div className="truncate text-[13px] text-ink-muted">{subtitle}</div>}
      </div>
      {person.threadId && (
        <Link
          href={`/connect/chat?thread=${person.threadId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-4 py-1.5 text-sm font-semibold text-brand-deep ring-1 ring-brand-soft transition hover:bg-brand-soft/40"
        >
          <MessageCircle size={14} /> Message
        </Link>
      )}
    </div>
  );
}

export function MyNetworkSection({
  companies,
  people,
}: {
  companies: ConnectedCompany[];
  people: DiscoverPersonConnection[];
}) {
  if (companies.length === 0 && people.length === 0) return null;

  return (
    <section className="glass-strong mt-6 rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-brand-deep" />
        <h2 className="text-lg font-bold text-ink">My Network</h2>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-ink-muted">
          {companies.length + people.length}
        </span>
      </div>

      {people.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">People</h3>
          <div className="flex flex-col gap-2">
            {people.map((p) => (
              <PersonRow key={p.personId} person={p} />
            ))}
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Companies</h3>
          <div className="flex flex-col gap-2">
            {companies.map((c) => (
              <CompanyRow key={c.companyId} company={c} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
