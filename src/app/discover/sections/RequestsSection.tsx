"use client";

/**
 * RequestsSection — incoming connection requests, rendered as one clean list (the
 * Variant D "Connection requests" box). It holds TWO kinds with genuinely
 * different accept paths (DISC-12): COMPANY→company requests (acceptItem /
 * declineItem, mints a company relationship + threads) and PERSON→person requests
 * (personActions, creates the person edge + a company-less DM). They share one
 * visual list — a square avatar means a company, a circle means a person — and
 * each item disappears independently as it's handled. Data is server-fetched and
 * passed as props; the box lives in the duo, so it fills a fixed height and
 * scrolls internally (SectionCard `fill`).
 */
import { useState } from "react";
import type { DiscoverCompanyRequest } from "../companyRequests";
import type { DiscoverPersonRequest } from "../incomingPersonRequests";
import { acceptItem, declineItem } from "@/modules/connect/supabase/inbox";
import { requestActionError } from "@/modules/connect/lib/requestActionError";
import { acceptPersonRequest, declinePersonRequest } from "../personActions";
import { SectionCard } from "./SectionCard";
import { requestTypeBadge, type DiscoverRequestKind, type RequestTypeBadge } from "../requestTypeMeta";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Badge({ label, icon: Icon, accent }: RequestTypeBadge) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-black/[0.03] px-2 py-0.5 text-[10px] font-bold ${accent}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function Actions({
  busy,
  onAccept,
  onDecline,
}: {
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={onDecline}
        disabled={busy}
        className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink-muted ring-1 ring-black/10 transition hover:bg-black/[0.04] disabled:opacity-60"
      >
        Decline
      </button>
      <button
        onClick={onAccept}
        disabled={busy}
        className="rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm shadow-brand/30 transition hover:bg-brand-deep disabled:opacity-60"
      >
        Accept
      </button>
    </div>
  );
}

/** One request row — divided list item (avatar · who · actions). */
function Row({
  avatar,
  name,
  note,
  kind,
  busy,
  onAccept,
  onDecline,
}: {
  avatar: React.ReactNode;
  name: string;
  note: string | null;
  kind: DiscoverRequestKind;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-black/5 py-3 first:border-t-0">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-ink">{name}</div>
        {note && <div className="truncate text-[12.5px] text-ink-muted">{note}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge {...requestTypeBadge(kind)} />
        <Actions busy={busy} onAccept={onAccept} onDecline={onDecline} />
      </div>
    </div>
  );
}

export function RequestsSection({
  companyRequests,
  personRequests,
}: {
  companyRequests: DiscoverCompanyRequest[];
  personRequests: DiscoverPersonRequest[];
}) {
  // The lists are DERIVED from props (so a realtime router.refresh brings in new
  // incoming requests live) minus the items handled locally this session — an
  // accepted/declined item stays gone even before the server refresh catches up.
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  // T10: both paths could fail silently — the company one had try/finally and no
  // catch (an unhandled rejection), the person one read `res.error` only to
  // decide whether to hide the row and then threw the reason away. Either way
  // the user clicked Accept and watched nothing happen.
  const [error, setError] = useState<string | null>(null);
  const markHandled = (id: string) => setHandled((h) => new Set(h).add(id));

  async function handleCompany(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    try {
      await (action === "accept" ? acceptItem(id) : declineItem(id));
      markHandled(id);
    } catch (e) {
      console.error("discover: connection request action failed", e);
      setError(requestActionError(e));
    } finally {
      setBusy(null);
    }
  }

  async function handlePerson(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    const res = await (action === "accept" ? acceptPersonRequest(id) : declinePersonRequest(id));
    setBusy(null);
    if ("error" in res) {
      // Already a finished sentence — personActions phrases its own failures.
      console.error("discover: person request action failed", res.error);
      setError(res.error);
      return;
    }
    markHandled(id);
  }

  const company = companyRequests.filter((c) => !handled.has(c.itemId));
  const people = personRequests.filter((p) => !handled.has(p.itemId));
  const total = company.length + people.length;

  return (
    <SectionCard title="Requests" count={total} fill>
      {error && (
        <p role="alert" className="mb-1 text-sm text-red-600">
          {error}
        </p>
      )}
      {total === 0 ? (
        <p className="flex h-full items-center justify-center py-10 text-center text-[13px] text-ink-muted">
          No pending requests.
        </p>
      ) : (
        <>
          {company.map((c) => (
            <Row
              key={c.itemId}
              avatar={
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-sm font-bold text-brand-deep">
                  {c.senderInitials}
                </span>
              }
              name={c.senderCompanyName}
              note={c.note}
              kind={c.type}
              busy={busy === c.itemId}
              onAccept={() => void handleCompany(c.itemId, "accept")}
              onDecline={() => void handleCompany(c.itemId, "decline")}
            />
          ))}
          {people.map((p) => (
            <Row
              key={p.itemId}
              avatar={
                p.senderAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.senderAvatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info/20 text-sm font-bold text-info">
                    {initials(p.senderName)}
                  </span>
                )
              }
              name={p.senderName}
              note={[p.senderTitle, p.senderCompanyName].filter(Boolean).join(" · ") || null}
              kind="person"
              busy={busy === p.itemId}
              onAccept={() => void handlePerson(p.itemId, "accept")}
              onDecline={() => void handlePerson(p.itemId, "decline")}
            />
          ))}
        </>
      )}
    </SectionCard>
  );
}
