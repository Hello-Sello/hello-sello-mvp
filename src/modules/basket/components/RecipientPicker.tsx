"use client";

import { useEffect, useState } from "react";
import { getMyConnections, type ConnectedCompany } from "@/modules/messaging";
import { CounterpartyPersonSelect } from "./CounterpartyPersonSelect";

/**
 * The SELLER's picker: who an OWN-company offer is sent to — a connected company
 * (mandatory, the select below) and then a person on that side (optional). Reuses
 * getMyConnections — the same connected directory the "+ New chat" picker uses.
 *
 * Only the company half is this component's own. The addressee half is
 * `CounterpartyPersonSelect`, shared with the BUYER's connected-seller group in
 * `BasketDrawer` (`BasketDrawer.tsx:358-367`) — which renders that control
 * directly and never mounts this picker, since a buyer's counterparty company is
 * the seller group itself, not a choice.
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

      {/* No `people.length > 0` gate: a company with no visible people still
          gets the control, showing "Whole company" — the same always-on
          addressee the buyer's group gets. */}
      {chosen && (
        <CounterpartyPersonSelect
          relationshipId={chosen.relationshipId}
          onPick={(counterpartyPersonId) =>
            onPick({ relationshipId: chosen.relationshipId, counterpartyPersonId })
          }
        />
      )}
    </div>
  );
}
