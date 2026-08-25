import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { RelationshipView } from "../types";

/**
 * The top-band header (prototype screen ③): the two companies joined by the
 * bridge mark (line · dot · line - NEVER `//`, which is the Hello Sello brand
 * mark), with no person names (it's a company↔company connection).
 *
 * The status line names the counterparty and the connected date - the
 * meaningful "who, since when" - rather than restating the viewer's own company.
 */
export function RelationshipHeader({ relationship }: { relationship: RelationshipView }) {
  const { companies, them, connectedAt, status } = relationship;
  const since = new Date(connectedAt).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  // HEL-82: status can now be suspended/ended, not just active — the record
  // (deals, notes, docs) stays fully readable either way, but this line must
  // not keep telling a suspended pair they're "Connected". Both sides still
  // see their own relationship page; only an HS operator can change status.
  const isLive = status === "active";

  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <Link
          href="/connect/chat"
          className="flex items-center gap-1.5 text-[12px] font-medium text-ink/45 transition hover:text-ink/70"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Back to chat with {them.name}
        </Link>
      </div>

      {/* two logos + bridge mark */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <CompanyBadge name={companies[0].name} initials={companies[0].initials} />
        <span className="flex flex-col items-center px-2">
          <span className="flex items-center" aria-hidden>
            <span className="block h-px w-9 bg-ink/20" />
            <span className="mx-1 block h-2.5 w-2.5 rounded-full bg-brand" />
            <span className="block h-px w-9 bg-ink/20" />
          </span>
          <span className="mt-1 text-[9px] uppercase tracking-wide text-ink/35">relationship</span>
        </span>
        <CompanyBadge name={companies[1].name} initials={companies[1].initials} />
      </div>

      {/* the meaningful status line: connected to whom, since when — or the
          real status when it's no longer active */}
      {isLive ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-ink/50">
          <span className="block h-1.5 w-1.5 rounded-full bg-success" />
          Connected to <span className="font-medium text-ink/70">{them.name}</span> since {since}
        </p>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-ink/50">
          <span className="block h-1.5 w-1.5 rounded-full bg-danger" />
          {status === "suspended" ? "Suspended" : "Ended"} — {them.name} (connected since {since})
        </p>
      )}
    </div>
  );
}

function CompanyBadge({ name, initials }: { name: string; initials: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-base font-bold text-brand">
        {initials}
      </span>
      <span className="max-w-[9rem] truncate text-xs font-semibold text-ink">{name}</span>
    </div>
  );
}
