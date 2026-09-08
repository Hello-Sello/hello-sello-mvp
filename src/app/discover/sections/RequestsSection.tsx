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
  // Shrinkable, with the LABEL truncating and the icon held at full size. The
  // badge used to be `shrink-0`, which made it the last thing spilling out of a
  // narrow card: at a 390px viewport the actions column is ~84px and this pill
  // is ~88px, so it pushed 4px past the card no matter how the buttons wrapped.
  // The icon carries the meaning when the text has to give way.
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-black/[0.03] px-2 py-0.5 text-[10px] font-bold ${accent}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
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
  // No `shrink-0` here or on the column that holds this (see Row): a shrink-0
  // flex item is sized to max-content and never compressed, so `flex-wrap` would
  // have no constraint to wrap against and the pair would sit at its full ~162px
  // however narrow the card got. Being shrinkable is what lets the two buttons
  // stack instead of spilling.
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
  // WRAPS rather than relying on a breakpoint, because no breakpoint can see
  // what constrains this row. A `md:`/`lg:` prefix reads the VIEWPORT, while the
  // width available here is the viewport minus the nav rail (200px expanded,
  // 64px collapsed — a user toggle, not a media query) minus the duo's column
  // split. At 768px `md:grid-cols-2` turns on at exactly the width where two
  // columns stop fitting, which left a 228px row in a 193px box. Asking the real
  // box instead of the window keeps this correct in either duo column, at any
  // rail state.
  //
  // `flex-[1_1_7rem]` on the name, spelled in full rather than `flex-1 basis-28`:
  // those two compile to `flex:1` (basis 0) plus `flex-basis:7rem` and only
  // resolve the way we want because of the order Tailwind happens to emit them.
  // The 7rem is the wrap threshold — avatar(44) + gap(12) + 112 = 168px is the
  // width below which the actions column is pushed onto its own line — so it is
  // a tuning knob, not an arbitrary size.
  //
  // `ml-auto` keeps the actions hard right on the line they wrap onto; at full
  // width the name's grow already does that, so desktop is unchanged.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-black/5 py-3 first:border-t-0">
      {avatar}
      <div className="min-w-0 flex-[1_1_7rem]">
        <div className="truncate font-bold text-ink">{name}</div>
        {note && <div className="truncate text-[12.5px] text-ink-muted">{note}</div>}
      </div>
      <div className="ml-auto flex min-w-0 flex-col items-end gap-1.5">
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
