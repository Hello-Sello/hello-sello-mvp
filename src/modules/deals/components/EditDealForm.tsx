"use client";

/**
 * Edit-a-deal wrapper (3.5b → 4.5.4) - feeds the shared DealForm the CURRENT
 * card's lines, terms, and the editor's own private box.
 *
 * 4.5.4 re-route (D-01/D-08): an edit is no longer the instant `editDeal` path.
 * Pressing Done now hands the edited SHARED fields + the PRIVATE box value UP to
 * the strip via `onProposeChange`; the STRIP collects the required change reason
 * in its Send pop-up and calls `proposeDealChange` (held two-sided change). The
 * reason is NEVER a buried form field (D-08), so this form no longer requires a
 * note. The form does NOT call `proposeDealChange` itself - it only relays the
 * payload up. `editDeal` stays in actions.ts for history (A4); this form simply
 * stops routing shared edits through it.
 */
import { DealForm } from "./DealForm";
import type { DealCardView, DraftLineInput } from "../types";

/** The edited SHARED fields + the PRIVATE box, handed UP to the strip's Send pop-up. */
export interface ProposeChangePayload {
  lines: DraftLineInput[];
  freeDelivery: boolean;
  dueDate: string | null;
  paymentTermsCode: string | null;
  /** the editor's OWN-side private box - written immediately, never in the shared draft (D-09) */
  privateValue: string | null;
}

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
  onProposeChange,
}: {
  data: DealCardView;
  onClose: () => void;
  /**
   * Relay the edited SHARED fields + the PRIVATE box UP to the strip. The strip
   * opens its Send pop-up to collect the required change reason and calls
   * `proposeDealChange` (D-08). The form never owns the reason and never calls
   * the action directly.
   */
  onProposeChange: (payload: ProposeChangePayload) => void;
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
      subtitle={<>Version {data.card.version} · the other side reviews this change</>}
      initialLines={toDraftLines(data)}
      initialFreeDelivery={freeDelivery}
      initialDueDate={dueDate}
      initialPaymentTermsCode={paymentTermsCode}
      initialPrivateValue={privateValue}
      noteRequired={false}
      submitLabel="Review change"
      onClose={onClose}
      onSubmit={async (p) => {
        // 4.5.4 - hand the edit UP to the strip; it collects the reason + Sends.
        // No reason here (D-08); the private box rides up for the strip to pass
        // into proposeDealChange (written immediately + ungated there, D-09).
        onProposeChange({
          lines: p.lines,
          freeDelivery: p.freeDelivery,
          dueDate: p.dueDate,
          paymentTermsCode: p.paymentTermsCode,
          privateValue: p.privateValue,
        });
      }}
    />
  );
}
