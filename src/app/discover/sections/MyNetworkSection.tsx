"use client";

/**
 * MyNetworkSection — your connections, in TWO parts (DISC-14): connected PEOPLE
 * (the social graph — each row has a Message button opening the company-less DM,
 * PG-13) and connected COMPANIES (the commercial graph — each expands to show your
 * contacts there). Sub-labels appear only when both kinds are present. The box
 * lives in the duo, so it fills a fixed height and scrolls internally (SectionCard
 * `fill`). Data is server-fetched and passed as props.
 */
import { useState } from "react";
import Link from "next/link";
import { MessageCircle, ChevronDown } from "lucide-react";
import type { ConnectedCompany } from "@/modules/messaging/types";
import type { DiscoverPersonConnection } from "../personNetwork";
import { VerifiedBadge } from "@/shared/ui/VerifiedBadge";
import { SectionCard } from "./SectionCard";

const TINTS = ["#34b233", "#6c7bd9", "#e30b5d", "#f59e0b", "#0ea5e9", "#8b5cf6",
  "#ef4444", "#14b8a6", "#ec4899", "#22c55e", "#a855f7", "#64748b"];
function tintFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{children}</h3>
);

/** Company logo = tinted rounded-square + the unconditional verified tick (Discover is verified-only). */
function CompanyLogo({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center rounded-2xl font-bold text-white shadow-sm ring-1 ring-black/5"
        style={{
          width: size, height: size, fontSize: size * 0.34,
          background: `linear-gradient(140deg, rgba(255,255,255,0.28), transparent 55%), ${tintFor(name)}`,
        }}
      >
        {initials(name)}
      </span>
      <VerifiedBadge status="verified" variant="tick" />
    </span>
  );
}

function CompanyRow({ company }: { company: ConnectedCompany }) {
  const [open, setOpen] = useState(false);
  const meta = [
    company.city,
    `${company.contactsCount} ${company.contactsCount === 1 ? "contact" : "contacts"}`,
    company.openDealCount > 0
      ? `${company.openDealCount} open ${company.openDealCount === 1 ? "deal" : "deals"}`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="border-t border-black/5 first:border-t-0">
      <div className="flex items-center gap-3 py-3">
        <CompanyLogo name={company.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink">{company.name}</div>
          <div className="truncate text-[12.5px] text-ink-muted">{meta}</div>
        </div>
        {company.people.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Show people"
            className="shrink-0 rounded-full p-1.5 text-ink-muted transition hover:bg-black/5"
          >
            <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
          </button>
        )}
      </div>
      {open && company.people.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-3 pl-[56px]">
          {company.people.map((p) => (
            <div key={p.personId} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/20 text-[10px] font-bold text-info">
                {p.initials}
              </span>
              <div className="min-w-0 truncate text-[12.5px]">
                <span className="font-semibold text-ink">{p.name}</span>
                {p.role && <span className="text-ink-muted"> · {p.role}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: DiscoverPersonConnection }) {
  const subtitle = [person.title, person.companyName].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 border-t border-black/5 py-3 first:border-t-0">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info/20 text-sm font-bold text-info">
          {initials(person.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-ink">{person.name}</div>
        {subtitle && <div className="truncate text-[12.5px] text-ink-muted">{subtitle}</div>}
      </div>
      {person.threadId && (
        <Link
          href={`/connect/chat?thread=${person.threadId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-brand-deep ring-1 ring-brand-soft transition hover:bg-brand-soft/40"
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
  const total = companies.length + people.length;
  const showLabels = companies.length > 0 && people.length > 0;

  return (
    <SectionCard title="My network" count={total} fill>
      {total === 0 ? (
        <p className="flex h-full items-center justify-center py-10 text-center text-[13px] text-ink-muted">
          No connections yet.
        </p>
      ) : (
        <>
          {people.length > 0 && (
            <div>
              {showLabels && <GroupLabel>People</GroupLabel>}
              {people.map((p) => (
                <PersonRow key={p.personId} person={p} />
              ))}
            </div>
          )}
          {companies.length > 0 && (
            <div>
              {showLabels && <GroupLabel>Companies</GroupLabel>}
              {companies.map((c) => (
                <CompanyRow key={c.companyId} company={c} />
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
