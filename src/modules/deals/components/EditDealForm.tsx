"use client";

/**
 * Edit-a-deal wrapper (3.5b → 4.5.4) - feeds the shared DealForm the CURRENT
 * card's lines, terms, and the editor's own per-line input.
 *
 * 4.5.4 re-route (D-01/D-08): an edit is no longer the instant `editDeal` path.
 * Pressing Done now hands the edited SHARED fields UP to the strip via
 * `onProposeChange` (the per-line own-side input rides inside `lines`); the STRIP
 * collects the required change reason in its Send pop-up and calls
 * `proposeDealChange` (held two-sided change). The
 * reason is NEVER a buried form field (D-08), so this form no longer requires a
 * note. The form does NOT call `proposeDealChange` itself - it only relays the
 * payload up. `editDeal` stays in actions.ts for history (A4); this form simply
 * stops routing shared edits through it.
 */
import { DealForm } from "./DealForm";
import { buildEditBasket } from "../lib/basket";
import type { DealCardView, DraftLineInput } from "../types";

/** The edited SHARED fields, handed UP to the strip's Send pop-up. */
export interface ProposeChangePayload {
  lines: DraftLineInput[];
  freeDelivery: boolean;
  dueDate: string | null;
  paymentTermsCode: string | null;
  /** the editor's OWN-side card note (NOTE-01) - rides the shared held draft, commits to the editor's own note slot only */
  note: string | null;
}

/** Map the current card's line items back into editable draft lines. */
function toDraftLines(data: DealCardView): DraftLineInput[] {
  // MRGN-01 / BLOCKER 1: thread the REAL deal_line_item.id so the per-line
  // private write (proposeDealChange) has its join key, and seed each line's
  // own margin input from lineMargins so re-Sending keeps the entered value.
  const marginByLineId = new Map(data.lineMargins.map((m) => [m.lineItemId, m.ownInput]));
  return data.lineItems.map((li) => ({
    productId: li.productId,
    lineItemId: li.id,
    productName: li.productName,
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    currency: li.currency,
    cultivar: li.cultivar,
    pzn: li.pzn,
    // BTCH-01 / D-04 (third coordinated freeze change, Pitfall 2): re-seed the
    // measured snapshot + batch from the line being edited. Hardcoding null here
    // would feed nulls into proposeDealChange and BLANK the snapshot on the
    // bumped version. The 3d ownInput re-seed (keyed by li.id) stays intact.
    thcPercent: li.thcPercent,
    cbdPercent: li.cbdPercent,
    batchId: li.batchId ?? null,
    batchNumber: li.batchNumber ?? null,
    ownInput: marginByLineId.get(li.id) ?? null,
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
  // Show who the deal is with (the OTHER company) as a locked "To" row, so the
  // assignee is visible on edit too - in p2p it is fixed by the relationship.
  // Person name needs the p2p chat thread (not carried into the deal workspace),
  // so this is company-level for now; the person can be threaded in later.
  const counterpartyCompany =
    data.viewerSide === "buyer" ? data.sellerName : data.buyerName;
  const dueDate = data.card.delivery_date_target
    ? data.card.delivery_date_target.slice(0, 10)
    : "";
  const paymentTermsCode = data.card.payment_terms_code ?? "";
  const initialNote = data.myNote ?? "";

  return (
    <DealForm
      title="Edit deal"
      subtitle={<>Version {data.card.version} · the other side reviews this change</>}
      recipient={{ personName: null, companyName: counterpartyCompany, hint: "Assigned" }}
      initialLines={toDraftLines(data)}
      initialFreeDelivery={freeDelivery}
      initialDueDate={dueDate}
      initialPaymentTermsCode={paymentTermsCode}
      initialNote={initialNote}
      side={data.viewerSide ?? undefined}
      noteRequired={false}
      submitLabel="Review change"
      onClose={onClose}
      onSubmit={async (content) => {
        // 4.5.4 - hand the edit UP to the strip; it collects the reason + Sends.
        // No reason here (D-08). The per-line own-side input rides inside `lines`
        // (each line's `ownInput` + `lineItemId`); proposeDealChange writes it to
        // deal_line_item_private immediately + ungated (D-09).
        // 3b: the edit identity is a Basket attached to this card (source p2p,
        // no recipient - Scope call A1); the relay shape to the strip is the
        // SAME shared fields as before (the Basket carries identity, the strip
        // the change reason). proposeDealChange is unchanged.
        const basket = buildEditBasket(content, data.card.id);
        onProposeChange({
          lines: basket.lines,
          freeDelivery: basket.freeDelivery,
          dueDate: basket.dueDate,
          paymentTermsCode: basket.paymentTermsCode,
          note: basket.note,
        });
      }}
    />
  );
}
