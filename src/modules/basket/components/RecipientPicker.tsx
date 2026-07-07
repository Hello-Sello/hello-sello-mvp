"use client";

import { useEffect, useState } from "react";
import { getMyConnections, type ConnectedCompany } from "@/modules/messaging";

/**
 * Pick who an OWN-company offer is sent to: a connected company (mandatory) and
 * optionally a person on that side. Reuses getMyConnections — the same connected
 * directory the "+ New chat" picker uses. Buyer (other-company) groups never
 * render this; their recipient is the seller company, implicit.
 */
export function RecipientPicker({
  onPick,
}: {
  onPick: (r: { relationshipId: string; counterpartyPersonId: string | null }) => void;
}) {
  const [companies, setCompanies] = useState<ConnectedCompany[]>([]);
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    void getMyConnections().then((c) => setCompanies(c.companies));
  }, []);

  const chosen = companies.find((c) => c.companyId === companyId);

  if (companies.length === 0) {
    return <p className="text-[11px] text-ink/50">Connect with a company first to send an offer.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label="Recipient company"
        className="rounded-lg bg-white/80 px-2 py-1.5 text-xs ring-1 ring-black/10"
        value={companyId}
        onChange={(e) => {
          setCompanyId(e.target.value);
          const c = companies.find((x) => x.companyId === e.target.value);
          if (c) onPick({ relationshipId: c.relationshipId, counterpartyPersonId: null });
        }}
      >
        <option value="">Select a customer…</option>
        {companies.map((c) => (
          <option key={c.companyId} value={c.companyId}>{c.name}</option>
        ))}
      </select>

      {chosen && chosen.people.length > 0 && (
        <select
          aria-label="Recipient person (optional)"
          className="rounded-lg bg-white/80 px-2 py-1.5 text-xs ring-1 ring-black/10"
          onChange={(e) =>
            onPick({ relationshipId: chosen.relationshipId, counterpartyPersonId: e.target.value || null })
          }
        >
          <option value="">Whole company (optional person)</option>
          {chosen.people.map((p) => (
            <option key={p.personId} value={p.personId}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
