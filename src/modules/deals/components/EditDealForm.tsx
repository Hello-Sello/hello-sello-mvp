"use client";

/**
 * Edit-a-deal wrapper (3.5b) - feeds the shared DealForm the CURRENT card's
 * lines, terms, and the editor's own private box, with a REQUIRED note (D2).
 * Pressing Update commits via the editDeal server action, which bumps the
 * version, snapshots the new lines (old version stays frozen), and resets the
 * confirm gate. On success the caller re-reads the card.
 */
import { DealForm } from "./DealForm";
import { editDeal } from "../actions";
import type { DealCardView, DraftLineInput } from "../types";

/** Map the current card's line items back into editable draft lines. */
function toDraftLines(data: DealCardView): DraftLineInput[] {
  return data.lineItems.map((li) => ({
    productId: li.productId,
    productName: li.productName,
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    currency: li.currency,
    cultivar: li.cultivar,
    pzn: li.pzn,
    thcPercent: null,
    cbdPercent: null,
  }));
}

export function EditDealForm({
  data,
  onClose,
  onUpdated,
}: {
  data: DealCardView;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const meta = (data.card.metadata ?? {}) as Record<string, unknown>;
  const freeDelivery = meta.free_delivery === true;
  const dueDate = data.card.delivery_date_target
    ? data.card.delivery_date_target.slice(0, 10)
    : "";
  const paymentTermsCode = data.card.payment_terms_code ?? "";
  const privateValue =
    data.partyFields.find((f) => f.fieldKey === "supplier_cost")?.value ??
    data.partyFields[0]?.value ??
    "";

  return (
    <DealForm
      title="Edit deal"
      subtitle={<>Version {data.card.version} · a change needs a note + re-confirmation</>}
      initialLines={toDraftLines(data)}
      initialFreeDelivery={freeDelivery}
      initialDueDate={dueDate}
      initialPaymentTermsCode={paymentTermsCode}
      initialPrivateValue={privateValue}
      noteRequired
      submitLabel="Update deal"
      onClose={onClose}
      onSubmit={async (p) => {
        await editDeal({
          dealCardId: data.card.id,
          lines: p.lines,
          freeDelivery: p.freeDelivery,
          dueDate: p.dueDate,
          paymentTermsCode: p.paymentTermsCode,
          privateValue: p.privateValue,
          note: p.note ?? "",
        });
        onUpdated();
      }}
    />
  );
}
