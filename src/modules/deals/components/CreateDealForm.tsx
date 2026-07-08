"use client";

/**
 * Create-a-deal wrapper (chj: was propose in 4.5.2) - feeds the shared DealForm
 * empty and BIRTHS a Draft card directly via the `createDeal` server action.
 *
 * Pressing "Send deal" births a live Draft card in ONE step (no proposal, no
 * accept). `createDeal` wraps `create_deal_draft`, which builds the whole draft
 * in one transaction (card + line items + workspace + 2 owner members + deal
 * thread + per-line private margin); the creator company is derived from the
 * SESSION and is hardcoded as the seller (deal_type 'offer', D-11). The private
 * box is SHOWN (`showPrivate=true`, `side="seller"`): this is a real birth, so
 * the per-line "your cost" + avg-margin is safe here (createDeal writes each
 * line's ownInput to deal_line_item_private).
 *
 * On success it dispatches `hs:deal-updated` then `hs:open-deal-card` (both with
 * the born `dealCardId`); `DealCardPanelHost` listens for `hs:open-deal-card` and
 * mounts the born Draft card as the right-side 50/50 panel.
 *
 * 3b (BSKT-01): the wrapper is a thin Deal Basket builder. It resolves the p2p
 * recipient (the other-side person + company) and builds a DealBasket via
 * `buildCreateBasket` (attachedDealId null, source 'p2p', recipient). The
 * recipient lives in the transient Basket only. The existing "To:" line is fed
 * from the resolved recipient (person · company), degrading to company-only while
 * the resolve is pending or when there is no person; it never blanks (D-07).
 *
 * The propose / detect actions STAY in the codebase (future C2C / detect path) -
 * this door just no longer calls them.
 */
import { useEffect, useState } from "react";
import { DealForm } from "./DealForm";
import { createDeal } from "../actions";
import { resolveP2pRecipient } from "../supabase/reads";
import { buildCreateBasket } from "../lib/basket";
import type { DealRecipientView } from "../types";

export function CreateDealForm({
  relationshipId,
  threadId,
  counterpartyName,
  onClose,
  onCreated,
}: {
  relationshipId: string;
  /** the p2p chat thread this create door was opened from (used to resolve the recipient) */
  threadId: string;
  counterpartyName: string;
  onClose: () => void;
  /** the Draft card was born - the parent closes the form (the card opens via hs:open-deal-card) */
  onCreated: () => void;
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
      title="Create a deal"
      subtitle="Build the deal, then send it to your contact"
      recipient={{ personName: personLabel, companyName: companyLabel }}
      showPrivate={true}
      side="seller"
      noteRequired={false}
      submitLabel="Send deal"
      onClose={onClose}
      onSubmit={async (content) => {
        // Build the transient Basket (the model that knows who it is for), then
        // BIRTH the Draft directly. We do NOT pass threadId to createDeal -
        // create_deal_draft builds its own deal thread + workspace + owners.
        const basket = buildCreateBasket(
          content,
          recipient
            ? { companyId: recipient.companyId, personId: recipient.personId }
            : null,
        );
        const { dealCardId } = await createDeal({
          relationshipId,
          lines: basket.lines,
          freeDelivery: basket.freeDelivery,
          dueDate: basket.dueDate,
          paymentTermsCode: basket.paymentTermsCode,
          note: basket.note,
        });
        // Tell siblings the deal changed, then open the born card in the
        // right-side 50/50 panel (DealCardPanelHost listens for hs:open-deal-card).
        window.dispatchEvent(
          new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
        );
        window.dispatchEvent(
          new CustomEvent("hs:open-deal-card", { detail: { dealCardId } }),
        );
        onCreated();
      }}
    />
  );
}
