"use client";

/**
 * Create-a-deal wrapper (3.5a) - feeds the shared DealForm empty, with an
 * optional note, and commits via the createDeal server action (the AI fence:
 * only a human Create press writes a deal).
 */
import { DealForm } from "./DealForm";
import { createDeal } from "../actions";

export function CreateDealForm({
  relationshipId,
  counterpartyName,
  onClose,
  onCreated,
}: {
  relationshipId: string;
  counterpartyName: string;
  onClose: () => void;
  onCreated: (dealCardId: string) => void;
}) {
  return (
    <DealForm
      title="Create a deal"
      subtitle={
        <>
          To <span className="font-medium text-ink/80">{counterpartyName}</span>
        </>
      }
      noteRequired={false}
      submitLabel="Create deal"
      onClose={onClose}
      onSubmit={async (p) => {
        const res = await createDeal({
          relationshipId,
          lines: p.lines,
          freeDelivery: p.freeDelivery,
          dueDate: p.dueDate,
          paymentTermsCode: p.paymentTermsCode,
          privateValue: p.privateValue,
          note: p.note,
        });
        onCreated(res.dealCardId);
      }}
    />
  );
}
