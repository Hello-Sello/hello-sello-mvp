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
 */
import { DealForm } from "./DealForm";
import { proposeDeal } from "../actions";

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
  return (
    <DealForm
      title="Propose a deal"
      subtitle={
        <>
          To <span className="font-medium text-ink/80">{counterpartyName}</span>
        </>
      }
      showPrivate={false}
      noteRequired={false}
      submitLabel="Send proposal"
      onClose={onClose}
      onSubmit={async (p) => {
        await proposeDeal({
          relationshipId,
          threadId,
          lines: p.lines,
          freeDelivery: p.freeDelivery,
          dueDate: p.dueDate,
          paymentTermsCode: p.paymentTermsCode,
          note: p.note,
        });
        onProposed();
      }}
    />
  );
}
