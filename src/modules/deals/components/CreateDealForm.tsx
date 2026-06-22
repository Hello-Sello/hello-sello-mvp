"use client";

/**
 * Propose-a-deal wrapper (4.5.2; was create in 3.5a) - feeds the shared DealForm
 * empty and commits via the `proposeDeal` server action.
 *
 * It no longer BIRTHS a card. It writes a `deal_detected` PROPOSAL into the p2p
 * thread (the sender's own side pre-accepted - sending IS their yes); the card
 * is born only when the OTHER side accepts (the AI fence still holds - a human
 * Send press writes the suggestion, a human Accept press writes the deal). The
 * private box is hidden (`showPrivate=false`): a proposal is a shared message, so
 * the seller's margin is added only after birth, via edit.
 *
 * 3b (BSKT-01): the wrapper is now a thin Deal Basket builder. It resolves the
 * p2p recipient (the other-side person + company) and builds a DealBasket via
 * `buildCreateBasket` (attachedDealId null, source 'p2p', recipient). The
 * recipient lives in the transient Basket only - `proposeDeal` is UNCHANGED and
 * takes no recipient (D-08, no DB). The existing "To:" line is fed from the
 * resolved recipient (person · company), degrading to company-only while the
 * resolve is pending or when there is no person; it never blanks (D-07).
 */
import { useEffect, useState } from "react";
import { DealForm } from "./DealForm";
import { proposeDeal } from "../actions";
import { resolveP2pRecipient } from "../supabase/reads";
import { buildCreateBasket } from "../lib/basket";
import type { DealRecipientView } from "../types";

export function CreateDealForm({
  relationshipId,
  threadId,
  counterpartyName,
  onClose,
  onProposed,
}: {
  relationshipId: string;
  /** the p2p chat thread the proposal message is posted into */
  threadId: string;
  counterpartyName: string;
  onClose: () => void;
  /** the proposal message was written - the strip re-reads to show "pending" */
  onProposed: () => void;
}) {
  // Resolve the recipient the same way DealPin loads its pending proposal: a
  // client-side async read into local state. No shared messaging prop is widened
  // (the person stays resolved inside the deals module).
  const [recipient, setRecipient] = useState<DealRecipientView | null>(null);
  useEffect(() => {
    let alive = true;
    void resolveP2pRecipient(relationshipId, threadId)
      .then((r) => alive && setRecipient(r))
      .catch(() => alive && setRecipient(null));
    return () => {
      alive = false;
    };
  }, [relationshipId, threadId]);

  // The "To:" line: person · company when resolved, else company-only. The
  // company label falls back to the prop so the line never blanks or flashes.
  const companyLabel = recipient?.companyName ?? counterpartyName;
  const personLabel = recipient?.personName ?? null;

  return (
    <DealForm
      title="Propose a deal"
      subtitle="Build the basket, then send it to your contact"
      recipient={{ personName: personLabel, companyName: companyLabel }}
      showPrivate={false}
      noteRequired={false}
      submitLabel="Send proposal"
      onClose={onClose}
      onSubmit={async (content) => {
        // Build the transient Basket (the model that knows who it is for); the
        // proposeDeal call shape stays exactly as before (no recipient - D-08).
        const basket = buildCreateBasket(
          content,
          recipient
            ? { companyId: recipient.companyId, personId: recipient.personId }
            : null,
        );
        await proposeDeal({
          relationshipId,
          threadId,
          lines: basket.lines,
          freeDelivery: basket.freeDelivery,
          dueDate: basket.dueDate,
          paymentTermsCode: basket.paymentTermsCode,
          note: basket.note,
        });
        onProposed();
      }}
    />
  );
}
