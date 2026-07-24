"use client";

/**
 * RequestsSection — incoming connection requests, in ONE section with TWO
 * labelled groups (DISC-12): "Company requests" (company→company, accepted via
 * the existing acceptItem/declineItem) and "People" (person→person, accepted via
 * personActions). The two accept paths are genuinely different — company accept
 * mints a company relationship + threads; person accept creates the person edge +
 * a company-less DM — so they're grouped, not blended. Data is server-fetched and
 * passed as props; each group empties independently as items are handled.
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { DiscoverCompanyRequest } from "../companyRequests";
import type { DiscoverPersonRequest } from "../incomingPersonRequests";
import { acceptItem, declineItem } from "@/modules/connect/supabase/inbox";
import { acceptPersonRequest, declinePersonRequest } from "../personActions";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

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
        onClick={onAccept}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
      >
        <Check size={14} /> Accept
      </button>
      <button
        onClick={onDecline}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-ink-muted ring-1 ring-black/5 transition hover:bg-white/90 disabled:opacity-60"
      >
        <X size={14} /> Decline
      </button>
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
  const [company, setCompany] = useState(companyRequests);
  const [people, setPeople] = useState(personRequests);
  const [busy, setBusy] = useState<string | null>(null);

  if (company.length === 0 && people.length === 0) return null;

  async function handleCompany(id: string, action: "accept" | "decline") {
    setBusy(id);
    try {
      await (action === "accept" ? acceptItem(id) : declineItem(id));
      setCompany((cs) => cs.filter((c) => c.itemId !== id));
    } finally {
      setBusy(null);
    }
  }

  async function handlePerson(id: string, action: "accept" | "decline") {
    setBusy(id);
    const res = await (action === "accept" ? acceptPersonRequest(id) : declinePersonRequest(id));
    setBusy(null);
    if (!("error" in res)) setPeople((ps) => ps.filter((p) => p.itemId !== id));
  }

  const total = company.length + people.length;

  return (
    <section className="glass-strong mt-6 rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold text-ink">Requests</h2>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-ink-muted">{total}</span>
      </div>

      {company.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Company requests</h3>
          <div className="flex flex-col gap-2">
            {company.map((c) => (
              <div key={c.itemId} className="glass flex items-center gap-3 rounded-xl px-3.5 py-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-xs font-bold text-brand-deep">
                  {c.senderInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{c.senderCompanyName}</div>
                  {c.note && <div className="truncate text-[13px] text-ink-muted">{c.note}</div>}
                </div>
                <Actions
                  busy={busy === c.itemId}
                  onAccept={() => void handleCompany(c.itemId, "accept")}
                  onDecline={() => void handleCompany(c.itemId, "decline")}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {people.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">People</h3>
          <div className="flex flex-col gap-2">
            {people.map((p) => (
              <div key={p.itemId} className="glass flex items-center gap-3 rounded-xl px-3.5 py-2.5">
                {p.senderAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.senderAvatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/20 text-xs font-bold text-info">
                    {initials(p.senderName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{p.senderName}</div>
                  <div className="truncate text-[13px] text-ink-muted">
                    {[p.senderTitle, p.senderCompanyName].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Actions
                  busy={busy === p.itemId}
                  onAccept={() => void handlePerson(p.itemId, "accept")}
                  onDecline={() => void handlePerson(p.itemId, "decline")}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
