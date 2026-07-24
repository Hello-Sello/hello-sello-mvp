"use server";

/**
 * Deals module - server actions.
 *
 * The confirm/decline/withdraw decisions and the create run on the SERVER (not
 * the client): writing rows, deriving the viewer's company from the SESSION
 * (never the caller), and `writeAudit` are server-only. The session-derived
 * company is the guardrail - a person can only act as their OWN side.
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { writeAudit } from "@/shared/audit";
import { createDealRpcArgs } from "./lib/createDealArgs";
import { buyerCompanyId, sellerCompanyId, viewerSide } from "./lib/derive";
import { canFinalizeByInvoice } from "./lib/finalize";
import type {
  ConfirmDealChangeInput,
  ConfirmDealChangeResult,
  ConfirmDecision,
  ConfirmDetectedResult,
  ConfirmResult,
  CreateDealInput,
  CreateDealResult,
  DealCardStatus,
  EditDealInput,
  EditDealResult,
  FinalizeDealResult,
  OfferPromotionInput,
  OfferPromotionResult,
  ProposeDealChangeInput,
  ProposeDealChangeResult,
} from "./types";

/** Map the form's draft lines to the RPC's jsonb line shape (shared by create + edit). */
function rpcLines(lines: CreateDealInput["lines"]) {
  return lines.map((l) => ({
    productId: l.productId,
    productName: l.productName,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    currency: l.currency,
    cultivar: l.cultivar ?? null,
    pzn: l.pzn ?? null,
    thcPercent: l.thcPercent ?? null,
    cbdPercent: l.cbdPercent ?? null,
    // BTCH-01 freeze (D-04, app half part 1): thread the chosen batch so
    // create_deal_draft writes batch_id/batch_number + the measured thc/cbd
    // into the REAL line columns on birth. Custom lines carry nulls naturally.
    batchId: l.batchId ?? null,
    batchNumber: l.batchNumber ?? null,
  }));
}

/** value_net = sum of the priced lines; null when NONE carry a price (D3/Q-C). */
function sumValueNet(lines: CreateDealInput["lines"]): number | null {
  const priced = lines.filter((l) => l.unitPrice != null);
  return priced.length
    ? priced.reduce((sum, l) => sum + l.quantity * (l.unitPrice as number), 0)
    : null;
}

export async function confirmDeal(args: {
  dealCardId: string;
  version: number;
  decision: ConfirmDecision;
}): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("confirmDeal: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("confirmDeal: no company in session");

  // the card + its relationship pair (to know what "both sides" means)
  const { data: card, error: cardErr } = await supabase
    .from("deal_card")
    .select("id, relationship_id, status, initiating_company_id")
    .eq("id", args.dealCardId)
    .single();
  if (cardErr) throw cardErr;

  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;
  const otherCompanyId =
    companyId === rel.company_a_id ? rel.company_b_id : rel.company_a_id;

  const now = new Date().toISOString();

  // ---- withdraw: initiator only, and only before the other side confirms ----
  if (args.decision === "withdraw") {
    if (companyId !== card.initiating_company_id) {
      throw new Error("Only the initiating side can withdraw this draft.");
    }
    const { data: otherRow } = await supabase
      .from("deal_confirmation")
      .select("status")
      .eq("deal_card_id", card.id)
      .eq("version", args.version)
      .eq("company_id", otherCompanyId)
      .maybeSingle();
    if (otherRow?.status === "confirmed") {
      throw new Error("The other side already confirmed - the draft cannot be withdrawn.");
    }
    // Phase-12: 'withdrawn' is retired (D-18) - a withdraw lands on 'cancelled'
    // (the backfill mapping). This whole path dies structurally in 12-07.
    await updateStatus(supabase, card.id, "cancelled");
    await logLine(supabase, card.id, args.version, user.id, "Draft withdrawn by the initiating side.");
    await writeAudit({
      actorType: "user",
      action: "deal.withdrawn",
      contentType: "deal_card",
      contentId: card.id,
      actorPersonId: user.id,
    });
    return { cardStatus: "cancelled", bothConfirmed: false };
  }

  // ---- confirm / decline: upsert THIS side's row -----------------------------
  const myStatus = args.decision === "confirm" ? "confirmed" : "rejected";
  const { error: upErr } = await supabase
    .from("deal_confirmation")
    .upsert(
      {
        deal_card_id: card.id,
        version: args.version,
        company_id: companyId,
        status: myStatus,
        responding_person_id: user.id,
        responded_at: now,
      },
      { onConflict: "deal_card_id,version,company_id" },
    );
  if (upErr) throw upErr;

  if (args.decision === "decline") {
    // the deal stays Draft and returns to negotiation; the row records the no
    await writeAudit({
      actorType: "user",
      action: "deal.declined",
      contentType: "deal_card",
      contentId: card.id,
      actorPersonId: user.id,
    });
    return { cardStatus: card.status as DealCardStatus, bothConfirmed: false };
  }

  // confirm: audit this party's yes, then check whether BOTH sides are in
  await writeAudit({
    actorType: "user",
    action: "deal.party_confirmed",
    contentType: "deal_card",
    contentId: card.id,
    actorPersonId: user.id,
  });

  const { data: rows, error: rowsErr } = await supabase
    .from("deal_confirmation")
    .select("company_id, status")
    .eq("deal_card_id", card.id)
    .eq("version", args.version);
  if (rowsErr) throw rowsErr;

  const confirmed = new Set(
    (rows ?? []).filter((r) => r.status === "confirmed").map((r) => r.company_id),
  );
  const bothConfirmed = confirmed.has(rel.company_a_id) && confirmed.has(rel.company_b_id);

  if (bothConfirmed && card.status === "negotiation") {
    await updateStatus(supabase, card.id, "confirmed");
    await logLine(supabase, card.id, args.version, user.id, "Deal confirmed by both sides.");
    await writeAudit({
      actorType: "user",
      action: "deal.confirmed",
      contentType: "deal_card",
      contentId: card.id,
      actorPersonId: user.id,
    });
    return { cardStatus: "confirmed", bothConfirmed: true };
  }

  return { cardStatus: card.status as DealCardStatus, bothConfirmed: false };
}

/**
 * Finalize a deal (Phase 7, D-27/D-28) - the invoice close that moves the card to
 * Done (Deal Executed).
 *
 * D-27 makes ONE thing the close trigger: the SELLER uploading a real invoice PDF.
 * There is no buyer confirm-receipt gate, and the Stages finalize gate (D-15) is
 * retired. DocumentsTab calls this right after the seller's upload, so the upload
 * itself closes the deal.
 *
 * Guardrails:
 *   - SELLER-ONLY (ASVS V4): the caller's company is derived from the SESSION and
 *     must BE the seller (derived from the card + relationship). A buyer-session
 *     finalize call is rejected before the gate.
 *   - INVOICE TRIGGER: the gate (`canFinalizeByInvoice`, pure/unit-tested) requires
 *     an AGREED status (`confirmed`/`amended`) AND a `deal_artifact(category=
 *     'invoice')` whose `uploaded_by_company_id` is the SELLER company. The
 *     uploader identity is stamped from the session at upload time
 *     (uploadDealInvoice), so a buyer-uploaded or forged invoice cannot satisfy it.
 *   - IDEMPOTENCY: an already-`done` card returns WITHOUT a second write.
 *
 * On pass: flip status -> done, log the invoice-close event to `deal_card_log`
 * (D-28 version history), and `writeAudit('deal.finalized')`.
 */
export async function finalizeDeal(args: {
  dealCardId: string;
}): Promise<FinalizeDealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("finalizeDeal: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("finalizeDeal: no company in session");

  // the card: status drives the idempotency guard + the gate; deal_type +
  // initiating_company_id + relationship_id derive the seller.
  const { data: card, error: cardErr } = await supabase
    .from("deal_card")
    .select("id, status, version, deal_type, initiating_company_id, relationship_id")
    .eq("id", args.dealCardId)
    .single();
  if (cardErr) throw cardErr;

  // idempotency guard: if already done, do NOT write again.
  if (card.status === "done") {
    return { cardStatus: "done" };
  }

  // derive the SELLER company from the card's issuer facts + the relationship pair.
  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;
  const seller = sellerCompanyId(
    {
      deal_type: card.deal_type as "offer" | "order",
      initiating_company_id: card.initiating_company_id,
    },
    rel.company_a_id,
    rel.company_b_id,
  );

  // SELLER-ONLY guard (ASVS V4): only the seller side may close the deal. A
  // buyer-session finalize call is rejected here, before the gate.
  if (companyId !== seller) {
    throw new Error("Only the seller can finalize this deal.");
  }

  // the workspace this card belongs to (the invoice artifact hangs off it).
  const { data: ws, error: wsErr } = await supabase
    .from("deal_workspace")
    .select("id")
    .eq("deal_card_id", card.id)
    .is("deleted_at", null)
    .single();
  if (wsErr) throw wsErr;

  // TRIGGER: a SELLER-uploaded invoice must exist. Requiring
  // uploaded_by_company_id = the seller company rejects a buyer-uploaded or forged
  // invoice (ASVS V4). deal_artifact + its columns ARE in the generated types.
  const { data: invoices, error: invErr } = await supabase
    .from("deal_artifact")
    .select("id")
    .eq("deal_workspace_id", ws.id)
    .eq("category", "invoice")
    .eq("uploaded_by_company_id", seller)
    .is("deleted_at", null)
    .limit(1);
  if (invErr) throw invErr;
  const hasSellerInvoice = (invoices?.length ?? 0) > 0;

  // GATE (D-27): agreed status + a seller invoice. Pure, unit-tested.
  if (!canFinalizeByInvoice(card.status as DealCardStatus, hasSellerInvoice)) {
    throw new Error(
      "A confirmed deal with the seller's invoice is required to finalize.",
    );
  }

  // flip status -> done (Deal Executed) and record the close in the card's version
  // history (D-28) + the audit chain.
  await updateStatus(supabase, card.id, "done");
  await logLine(
    supabase,
    card.id,
    card.version,
    user.id,
    "Deal Executed - the seller uploaded the invoice.",
  );
  await writeAudit({
    actorType: "user",
    action: "deal.finalized",
    contentType: "deal_card",
    contentId: card.id,
    actorPersonId: user.id,
  });

  return { cardStatus: "done" };
}

/**
 * Create a draft deal card from a chat (3.5a). The SINGLE human-pressed commit:
 * only this action, triggered by a human Create button, writes a deal - Sella
 * may FILL the form but never calls this directly (the AI fence).
 *
 * The whole deal is born in ONE transaction by the `create_deal_draft` SECURITY
 * DEFINER RPC: the card (draft, v1) + line items + its container (workspace +
 * creator-as-owner + the deal chat thread + an opening line) + the creation log
 * line + the optional note. One transaction = no orphan cards, and it sidesteps
 * the workspace-membership bootstrap that RLS cannot satisfy at a deal's birth.
 * The RPC derives the creator's company from the session and gates on
 * relationship membership (the guardrail). Audit (`deal.created`) stays here so
 * the hash-chain helper owns it.
 *
 * Per-line margin (D-11, MRGN-01): the create-time `deal_party_field` private
 * box is retired (the RPC dropped it; plan 05). Instead, AFTER the card is born,
 * each line's own-side input is written to the owner-only `deal_line_item_private`
 * table. This MUST run after the RPC returns, because the private rows are keyed
 * by `deal_line_item.id` and those ids exist only once the RPC has inserted the
 * lines.
 */
export async function createDeal(input: CreateDealInput): Promise<CreateDealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("createDeal: no authenticated user");

  const currency = input.lines[0]?.currency ?? "EUR";

  // The RPC is new, so it is not in the generated types yet - a localized cast
  // (Muskan's documented pattern) avoids a full database.types regen. Call
  // supabase.rpc DIRECTLY (not via a detached const) so its `this` stays bound.
  // p_private_value is now accepted-but-ignored server-side (D-09); we stop
  // forwarding a value and write the per-line private rows after birth instead.
  const { p_deal_type, p_counterparty_person_id } = createDealRpcArgs(input);
  const { data: cardId, error } = await supabase.rpc("create_deal_draft" as never, {
    p_relationship_id: input.relationshipId,
    p_deal_type,
    p_value_net: sumValueNet(input.lines),
    p_currency: currency,
    p_due_date: input.dueDate ?? null,
    p_payment_terms_code: input.paymentTermsCode ?? null,
    p_free_delivery: input.freeDelivery ?? false,
    p_lines: rpcLines(input.lines),
    p_private_value: null,
    p_note: input.note ?? null,
    p_counterparty_person_id,
  } as never);
  if (error) throw new Error((error as { message: string }).message);
  const newCardId = cardId as string | null;
  if (!newCardId) throw new Error("createDeal: no card id returned from create_deal_draft");

  // PER-LINE PRIVATE write (D-11, MRGN-01) - after birth, because the private
  // rows are keyed by the real `deal_line_item.id`. Read the v1 lines back (the
  // RPC inserts them in `input.lines` order with sort_order 0..n, so sort_order
  // IS the input index), then upsert each line's own-side input into the
  // owner-only `deal_line_item_private`. The company is taken from the SESSION
  // (`getCurrentCompanyId()`), NEVER from input - the same guardrail the edit
  // path uses. On the DEFAULT ('offer') create path the creator is ALWAYS the
  // seller: `initiating_company_id = v_company` + `deal_type 'offer'`, so the
  // creator's `viewerSide` is "seller" - hence seller_margin is the correct
  // column (no viewerSide call needed here, by construction).
  // NOTE (Product Basket, dealType/counterpartyPersonId passthrough): no
  // current caller passes `dealType: "order"` together with `ownInput` lines,
  // so this hardcoded seller_margin write is still correct for every existing
  // and in-flight caller. A FUTURE buyer-initiated 'order' create path that
  // also carries ownInput would need a viewerSide() check here (like
  // proposeDealChange does) before this stays correct - flagged, not fixed,
  // since no such caller exists yet.
  if (input.lines.some((l) => l.ownInput != null)) {
    const companyId = await getCurrentCompanyId();
    if (!companyId) throw new Error("createDeal: no company in session");

    const { data: bornLines, error: linesErr } = await supabase
      .from("deal_line_item")
      .select("id, sort_order")
      .eq("deal_card_id", newCardId)
      .eq("version", 1);
    if (linesErr) throw linesErr;

    const idBySort = new Map((bornLines ?? []).map((r) => [r.sort_order, r.id]));
    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      if (l.ownInput == null) continue;
      const lineId = idBySort.get(i);
      if (!lineId) {
        throw new Error(`createDeal: no born line id for input index ${i}`);
      }
      const { error: privErr } = await supabase.from("deal_line_item_private").upsert(
        {
          deal_line_item_id: lineId,
          company_id: companyId,
          seller_margin: l.ownInput,
          buyer_metric: null,
          created_by: user.id,
        },
        { onConflict: "deal_line_item_id,company_id" },
      );
      if (privErr) throw privErr;
    }
  }

  await writeAudit({
    actorType: "user",
    action: "deal.created",
    contentType: "deal_card",
    contentId: newCardId,
    actorPersonId: user.id,
  });

  return { dealCardId: newCardId };
}

/** A short human label for a proposal, from its lines (drives the message body). */
function draftSummary(lines: CreateDealInput["lines"]): string {
  if (!lines.length) return "a deal";
  const first = lines[0].productName?.trim() || "a deal";
  return lines.length === 1 ? first : `${first} +${lines.length - 1} more`;
}

/**
 * Accept or decline a deal PROPOSAL (Waypoint 4.5.2) - the unified birth-accept.
 *
 * Wraps `confirm_detected_deal`: records THIS side's vote on the `deal_detected`
 * message and, the instant BOTH companies have accepted, births the Draft (card
 * + workspace + 2 owners + deal thread) atomically and returns the new card id.
 * A first accept (still waiting on the other side) or a reject returns null. One
 * action serves BOTH doors - a Sella-detected and a manual proposal are the same
 * message shape, so birth follows one path with two entry doors.
 *
 * AUDIT-01: the birth's `deal.created` audit row is now stamped here, closing the
 * RPC-born gap (createDeal stamped one; detection/propose never did). The RPC
 * used to return the same card id whether THIS call birthed it or an earlier one
 * did (idempotency), so the action could not tell "born now" from "already born"
 * and dared not risk a double-stamp into the hash-chained log. The RPC now also
 * returns a `born_now` boolean (20260707130200); we writeAudit('deal.created')
 * ONLY when born_now is true, mirroring createDeal, so the row is written exactly
 * once (T-07-03-02).
 */
export async function confirmDetectedDeal(args: {
  messageId: string;
  decision: "accept" | "reject";
}): Promise<ConfirmDetectedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("confirmDetectedDeal: no authenticated user");

  // SECURITY DEFINER RPC: derives the caller's company from the SESSION (never
  // trusted from input) and gates on thread membership - the same guardrail as
  // create_deal_draft. Direct supabase.rpc call so `this` stays bound. The RPC's
  // new OUT-param shape ({ deal_card_id, born_now }) is not in the generated types
  // yet, so it rides the localized `as never` cast (Muskan's documented pattern;
  // no full database.types regen this phase - 07-08 regenerates).
  const { data, error } = await supabase.rpc("confirm_detected_deal" as never, {
    p_message_id: args.messageId,
    p_decision: args.decision,
  } as never);
  if (error) throw new Error((error as { message: string }).message);

  // Two OUT params come back as one record; be tolerant of a single-object or
  // an array-of-one shape across PostgREST versions.
  const rec = (Array.isArray(data) ? data[0] : data) as
    | { deal_card_id: string | null; born_now: boolean }
    | null;
  const bornCardId = rec?.deal_card_id ?? null;
  const bornNow = rec?.born_now === true;

  // AUDIT-01: stamp deal.created EXACTLY once, on the true born-now path only.
  // Mirrors createDeal's audit write (same actorType/action/contentType). The
  // idempotent re-call path returns born_now=false, so a second confirmer's click
  // never double-stamps the hash-chained log.
  if (bornNow && bornCardId) {
    await writeAudit({
      actorType: "user",
      action: "deal.created",
      contentType: "deal_card",
      contentId: bornCardId,
      actorPersonId: user.id,
    });
  }

  return { bornCardId };
}

/**
 * Edit a deal into a NEW version (3.5b). The human-pressed commit for a change:
 * one atomic `edit_deal_draft` RPC bumps the version, snapshots the new lines
 * (old version stays frozen), drops the card back to `draft` (so 3d's gate
 * re-runs), and records the MANDATORY note. The note is required (the RPC also
 * enforces it). Audit = `deal.amended`. Per-line margin is NOT carried here -
 * it lives in deal_line_item_private now (D-09); editDeal is the dormant path.
 */
export async function editDeal(input: EditDealInput): Promise<EditDealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("editDeal: no authenticated user");
  if (!input.note || !input.note.trim()) {
    throw new Error("editDeal: a note is required for every change");
  }

  const currency = input.lines[0]?.currency ?? "EUR";

  const { data: newVersion, error } = await supabase.rpc("edit_deal_draft" as never, {
    p_deal_card_id: input.dealCardId,
    p_value_net: sumValueNet(input.lines),
    p_currency: currency,
    p_due_date: input.dueDate ?? null,
    p_payment_terms_code: input.paymentTermsCode ?? null,
    p_free_delivery: input.freeDelivery ?? false,
    p_lines: rpcLines(input.lines),
    // EditDealInput no longer carries a private value (the per-line margin moved
    // to deal_line_item_private, D-09). editDeal is the dormant instant path
    // (4.5.4 routes edits through proposeDealChange); pass null to keep it
    // compiling without changing its behaviour.
    p_private_value: null,
    p_note: input.note.trim(),
  } as never);
  if (error) throw new Error((error as { message: string }).message);
  const version = (newVersion as number) ?? 0;

  await writeAudit({
    actorType: "user",
    action: "deal.amended",
    contentType: "deal_card",
    contentId: input.dealCardId,
    actorPersonId: user.id,
  });

  // 4d: Sella explains WHY the deal changed (person-waiting -> inline, per the
  // placement rule). The Bedrock call lives in the sella-summarize edge fn so the key
  // stays in Supabase (Path A); this only triggers it. FAIL-SOFT: a summary failure
  // must NOT fail the edit - the new version already committed.
  try {
    await supabase.functions.invoke("sella-summarize", {
      body: { deal_card_id: input.dealCardId, version },
    });
  } catch {
    // Sella down -> no summary line; the edit + deal are unaffected.
  }

  return { version };
}

/**
 * Propose a HELD two-sided change to a deal (4.5.4) - the human-pressed Send
 * that replaces the instant `editDeal` for SHARED terms. This does NOT bump the
 * live card; it INSERTs one held `deal_pending_change` row (via the
 * `propose_deal_change` RPC) with the proposer's own side pre-voted `accept`.
 * The card moves to base+1 only when the OTHER side accepts, inside
 * `confirmDealChange`. The AI fence holds: a human Send writes the held change;
 * a human Accept (the other side) writes the deal.
 *
 * Two writes, in order:
 *   1. PER-LINE PRIVATE first (D-07/D-09, MRGN-01): each line's own-side input
 *      (seller cost / buyer resale) is written IMMEDIATELY + ungated to
 *      `deal_line_item_private`, keyed by the line's REAL id. It is the actor's
 *      own data (RLS owner-only allows it; no company id is trusted from input -
 *      the write targets `getCurrentCompanyId()`), and it NEVER enters the
 *      shared held draft. On commit, `confirm_deal_change` carries every base-
 *      version private row forward to the new version (by product_id, plan 02).
 *   2. SHARED next: the held draft carries SHARED keys ONLY (line_items incl.
 *      productId, value, currency, terms) - the same keys `confirm_deal_change`
 *      reads on commit; no per-line cost/resale ever rides this draft.
 *
 * The RPC's unique lock rejects a second concurrent propose with a friendly
 * message; we surface it (O4) so the form's error banner shows it. The reason
 * is required (the RPC also enforces it - two layers, REAS-01).
 */
export async function proposeDealChange(
  input: ProposeDealChangeInput,
): Promise<ProposeDealChangeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("proposeDealChange: no authenticated user");
  if (!input.reason || !input.reason.trim()) {
    throw new Error("proposeDealChange: a change reason is required");
  }

  const currency = input.lines[0]?.currency ?? "EUR";

  // --- 1. PER-LINE PRIVATE input first: immediate, ungated, OWN company (D-07/
  // D-09, MRGN-01). Each side types a fresh per-line cost (seller) / resale
  // (buyer); we write it to the owner-only `deal_line_item_private` table keyed
  // by the line's REAL id (l.lineItemId, threaded from the card by
  // EditDealForm.toDraftLines - BLOCKER 1). This NEVER enters the shared held
  // draft below (Pitfall 3 - ADR-0002's two-visibility-classes rule); the margin
  // is computed live on the card from this stored input + the line's unit_price.
  //
  // To pick seller_margin vs buyer_metric we must know the CALLER's side. The
  // old box hardcoded `party_side: 'seller'` (the named D-09 bug); instead we
  // read the card's issuer facts + the relationship pair and resolve the side via
  // viewerSide(). The create path (no lineItemId until create_deal_draft returns
  // the new ids) wires the same per-line write separately in plan 05 (D-11).
  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("proposeDealChange: no company in session");

  const { data: cardRow, error: cardErr } = await supabase
    .from("deal_card")
    .select("initiating_company_id, deal_type, relationship_id")
    .eq("id", input.dealCardId)
    .single();
  if (cardErr) throw cardErr;

  const { data: relRow, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", cardRow.relationship_id)
    .single();
  if (relErr) throw relErr;

  const side = viewerSide(
    companyId,
    {
      deal_type: cardRow.deal_type as "offer" | "order",
      initiating_company_id: cardRow.initiating_company_id,
    },
    relRow.company_a_id,
    relRow.company_b_id,
  );

  // own-company per-line write: RLS (dli_private_all) allows company_id =
  // current_company_id() for a line the caller can see. Upsert on the table's
  // unique key (deal_line_item_id, company_id) so a re-Send overwrites the
  // actor's own value for that line (Pitfall 2 - it IS upsert semantics).
  for (const l of input.lines) {
    if (l.ownInput == null || !l.lineItemId) continue;
    const { error: privErr } = await supabase.from("deal_line_item_private").upsert(
      {
        deal_line_item_id: l.lineItemId,
        company_id: companyId,
        seller_margin: side === "seller" ? l.ownInput : null,
        buyer_metric: side === "buyer" ? l.ownInput : null,
        created_by: user.id,
      },
      { onConflict: "deal_line_item_id,company_id" },
    );
    if (privErr) throw privErr;
  }

  // --- 2. SHARED held draft: SHARED keys ONLY (no per-line ownInput, D-09). The
  // line_items use the SAME keys confirm_deal_change reads on commit (name,
  // quantity, unit, unit_price, cultivar, pzn) PLUS productId so a held commit
  // does not wipe the line's product link and plan 02's carry-forward has a key
  // to join on (Pitfall 1).
  const draft = {
    line_items: input.lines.map((l) => ({
      productId: l.productId,
      name: l.productName,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unitPrice,
      cultivar: l.cultivar ?? null,
      pzn: l.pzn ?? null,
      // BTCH-01 freeze (D-04, app half part 1): carry the batch snapshot ON the
      // held draft line (snapshot-through-draft) so confirm_deal_change writes
      // batch_id/batch_number + measured thc/cbd into the new version's line
      // columns verbatim - no product_id JOIN. The THIRD coordinated freeze
      // change (EditDealForm.toDraftLines re-seeding these from LineItemView on
      // edit) is Plan 04; until it lands, an EDIT that omits them would drop the
      // snapshot on the bumped version (Pitfall 2).
      batchId: l.batchId ?? null,
      batchNumber: l.batchNumber ?? null,
      thcPercent: l.thcPercent ?? null,
      cbdPercent: l.cbdPercent ?? null,
    })),
    value_net: sumValueNet(input.lines),
    currency,
    summary: draftSummary(input.lines),
    due_date: input.dueDate ?? null,
    payment_terms_code: input.paymentTermsCode ?? null,
    free_delivery: input.freeDelivery ?? false,
    note: input.note ?? null,
  };

  // New RPC, not in the generated types - the localized `as never` cast (Muskan's
  // documented pattern). Call supabase.rpc DIRECTLY so `this` stays bound. The
  // RPC derives the caller's company from the session (no trusted company id).
  const { data: pendingId, error } = await supabase.rpc("propose_deal_change" as never, {
    p_deal_card_id: input.dealCardId,
    p_draft: draft,
    p_reason: input.reason.trim(),
  } as never);
  // surface the unique-violation (and any RPC raise) into the form's error banner (O4)
  if (error) throw new Error((error as { message: string }).message);
  const newPendingId = pendingId as string | null;
  if (!newPendingId) {
    throw new Error("proposeDealChange: no pending id returned from propose_deal_change");
  }

  await writeAudit({
    actorType: "user",
    action: "deal.change_proposed",
    contentType: "deal_card",
    contentId: input.dealCardId,
    actorPersonId: user.id,
  });

  return { pendingId: newPendingId };
}

/**
 * Respond to a held change (4.5.4) - the OTHER side's Accept/Decline from the
 * strip pop-up, with the REQUIRED reason (REAS-01). Wraps `confirm_deal_change`:
 * it records this side's vote and, the instant BOTH companies have accepted,
 * commits the change to base+1 (status stays `draft`, D-06) and returns the new
 * version; a first accept (still waiting) or a decline returns null (the decline
 * discards the held change). The reason is required (the RPC also enforces it).
 *
 * No Phase-2 announcement is fired here (A5): the both-chats announcement is the
 * next phase's design, so this commit path deliberately does NOT invoke
 * sella-summarize. The audit code records the outcome (committed vs declined).
 */
export async function confirmDealChange(
  input: ConfirmDealChangeInput,
): Promise<ConfirmDealChangeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("confirmDealChange: no authenticated user");
  if (!input.reason || !input.reason.trim()) {
    throw new Error("confirmDealChange: a change reason is required");
  }

  const { data: newVersion, error } = await supabase.rpc("confirm_deal_change" as never, {
    p_deal_card_id: input.dealCardId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  } as never);
  if (error) throw new Error((error as { message: string }).message);

  await writeAudit({
    actorType: "user",
    action: input.decision === "accept" ? "deal.change_committed" : "deal.change_declined",
    contentType: "deal_card",
    contentId: input.dealCardId,
    actorPersonId: user.id,
  });

  return { version: (newVersion as number | null) ?? null };
}

/**
 * Withdraw a held change (4.5.4, DCHG-06) - the PROPOSER's take-back. The
 * thinnest of the three: no reason, no card change. Wraps `withdraw_deal_change`
 * (proposer-only, enforced in the RPC), which discards the held row and unlocks
 * the Edit pencil. Distinct from the seal Withdraw (Phase 2).
 */
export async function withdrawDealChange({
  dealCardId,
}: {
  dealCardId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("withdrawDealChange: no authenticated user");

  const { error } = await supabase.rpc("withdraw_deal_change" as never, {
    p_deal_card_id: dealCardId,
  } as never);
  if (error) throw new Error((error as { message: string }).message);

  await writeAudit({
    actorType: "user",
    action: "deal.change_withdrawn",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
}

/**
 * Project a deal lifecycle event into the chat stream — the DEV-33 doctrine:
 * the chat is the activity feed, and every deal event lands as a thin
 * WhatsApp-style system line ("the system message is a projection of a log
 * entry", DECISIONS 2026-05-22). Posts into the thread people actually read —
 * the relationship's p2p thread when one exists (person deals), else the c2c
 * company channel — plus the deal's own hidden thread as the durable record.
 *
 * FAIL-SOFT by design: the deal action has already committed by the time this
 * runs, so a failed announcement logs and returns — it never surfaces as a
 * failed decline/sign. (The SQL-side announcements in confirm_deal_change are
 * transactional with their status change; these app-side ones are not — the
 * accepted trade-off of keeping declineDeal/signDeal as app actions.)
 * Inserted per-thread (not one batch) so an RLS miss on one thread — e.g. a
 * p2p pair the actor isn't part of — never voids the others.
 */
async function announceDealEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealCardId: string,
  relationshipId: string,
  type: "deal_cancelled" | "deal_signed",
  body: string,
): Promise<void> {
  try {
    const { data: threads } = await supabase
      .from("chat_thread")
      .select("id, type, deal_card_id")
      .eq("relationship_id", relationshipId)
      .is("deleted_at", null);
    const list = threads ?? [];
    const targets: string[] = [];
    const dealThread = list.find((t) => t.type === "deal" && t.deal_card_id === dealCardId);
    if (dealThread) targets.push(dealThread.id);
    const visible = list.find((t) => t.type === "p2p") ?? list.find((t) => t.type === "c2c");
    if (visible) targets.push(visible.id);
    for (const thread_id of targets) {
      const { error } = await supabase.from("chat_message").insert({
        thread_id,
        sender: "sella",
        type,
        body,
        metadata: { deal_card_id: dealCardId },
      });
      if (error) console.error("deal event announcement failed", error);
    }
  } catch (e) {
    console.error("deal event announcement failed", e);
  }
}

/**
 * Decline a deal (chj/07-08) - the "end it" action from the on-card DecisionBar.
 * A decline is a CLOSE, not a delete (the user's lifecycle rule): the card flips
 * to `cancelled` and reuses the existing closed-deal handling (the lock, no more
 * editing). It is distinct from Negotiate (`confirmDealChange({decision:'decline'})`,
 * which only discards a held change and keeps bargaining).
 *
 * Guardrails: the caller's company is derived from the SESSION and must be a party
 * to the deal's relationship (no trusted company id). Idempotent - an already-closed
 * (`cancelled`/`done`) deal returns without a second write. Any held pending change
 * is left in place; the `cancelled` status hides the DecisionBar, so it cannot be
 * acted on.
 */
export async function declineDeal(args: { dealCardId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("declineDeal: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("declineDeal: no company in session");

  const { data: card, error: cardErr } = await supabase
    .from("deal_card")
    .select("id, status, version, relationship_id")
    .eq("id", args.dealCardId)
    .single();
  if (cardErr) throw cardErr;

  // membership guard: the caller's company must be a party to this deal.
  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;
  if (companyId !== rel.company_a_id && companyId !== rel.company_b_id) {
    throw new Error("Only a party to this deal can decline it.");
  }

  // idempotent: an already-closed deal does not get a second write.
  if (card.status === "cancelled" || card.status === "done") return;

  await updateStatus(supabase, card.id, "cancelled");
  await logLine(
    supabase,
    card.id,
    card.version,
    user.id,
    "Deal declined - the deal is closed.",
  );
  await writeAudit({
    actorType: "user",
    action: "deal.declined",
    contentType: "deal_card",
    contentId: card.id,
    actorPersonId: user.id,
  });
  // DEV-33: project the decline into the chat stream (thin system line)
  await announceDealEvent(
    supabase,
    card.id,
    card.relationship_id,
    "deal_cancelled",
    "Deal declined - the deal is closed.",
  );
}

/**
 * Sign a deal (chj/07-08) - the single-sign accept. The party who did NOT send the
 * latest version signs; NO note, NO reason (the user's flow: sign is a direct
 * button). If a change is held, it is committed first (confirm_deal_change accept,
 * auto reason) so the signed version is the proposed one; then the card flips to
 * `confirmed` - the AGREED state that locks editing and lets the SELLER upload the
 * invoice (finalizeDeal's gate).
 *
 * Guardrails: the caller's company comes from the SESSION and must be a party;
 * idempotent (a non-draft deal returns unchanged). This flips the status DIRECTLY
 * and does NOT write `deal_confirmation`, keeping confirm_deal_change out of the
 * seal gate (the prior regression: confirm writes leaked into that gate).
 */
export async function signDeal({
  dealCardId,
}: {
  dealCardId: string;
}): Promise<{ cardStatus: DealCardStatus }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("signDeal: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("signDeal: no company in session");

  const { data: card, error: cardErr } = await supabase
    .from("deal_card")
    .select("id, status, version, relationship_id")
    .eq("id", dealCardId)
    .single();
  if (cardErr) throw cardErr;

  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;
  if (companyId !== rel.company_a_id && companyId !== rel.company_b_id) {
    throw new Error("Only a party to this deal can sign it.");
  }

  // idempotent: only a live negotiation (sent, bargaining) can be signed.
  if (card.status !== "negotiation") return { cardStatus: card.status as DealCardStatus };

  // if a change is held, COMMIT it first so the signed version is the proposed one.
  // confirm_deal_change (accept) is responder-only + enforces that in the RPC; the
  // reason is auto (no note UI). Per D-20 the proposer's yes is implicit, so a
  // responder accept commits the change (never a still-waiting first accept).
  const { data: held } = await supabase
    .from("deal_pending_change" as never)
    .select("deal_card_id")
    .eq("deal_card_id", dealCardId)
    .maybeSingle();
  if (held) {
    const { error: cErr } = await supabase.rpc("confirm_deal_change" as never, {
      p_deal_card_id: dealCardId,
      p_decision: "accept",
      p_reason: "Signed the deal",
    } as never);
    if (cErr) throw new Error((cErr as { message: string }).message);
  }

  await updateStatus(supabase, dealCardId, "confirmed");
  await logLine(supabase, dealCardId, card.version, user.id, "Deal signed.");
  await writeAudit({
    actorType: "user",
    action: "deal.confirmed",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
  // DEV-33: project the sign into the chat stream (thin system line)
  await announceDealEvent(
    supabase,
    dealCardId,
    card.relationship_id,
    "deal_signed",
    "Deal signed - the deal is confirmed.",
  );
  return { cardStatus: "confirmed" };
}

/* -------------------------------------------------------------------------- */
/* Promotion (07-06, PROMO-01) - the INDEPENDENT yellow track.                 */
/*                                                                            */
/* D-21: a seller promotion is a SEPARATE decision from the negotiation diff - */
/* its own `deal_promotion` row, NO shared lock (a live promotion and a live   */
/* negotiation never block each other). D-26 (load-bearing): NONE of these     */
/* touch `deal_confirmation` or the Sign gate, and offer does NOT bump the      */
/* version - Sign stays callable throughout. The savings math lives in          */
/* `lib/promotion.ts` (pure, canonical per-gram money, D-25).                  */
/* -------------------------------------------------------------------------- */

/**
 * Offer a promotion (07-06, seller-only). Inserts one pending `deal_promotion`
 * row with the seller's REAL product-table reward lines (D-21) + any non-product
 * rewards (D-22). Unlike `proposeDealChange` there is NO reason gate and NO
 * version bump (D-26). The seller side is re-derived from the SESSION + the card
 * (T-07-06-01) - never trusted from the caller.
 */
export async function offerPromotion(
  input: OfferPromotionInput,
): Promise<OfferPromotionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("offerPromotion: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("offerPromotion: no company in session");

  const { version, sellerId } = await dealSides(supabase, input.dealCardId);
  if (companyId !== sellerId) {
    throw new Error("Only the seller can offer a promotion.");
  }

  // deal_promotion is not in the generated types -> the localized `as never` cast
  // (Muskan's documented pattern; no full regen this phase).
  const { data, error } = await supabase
    .from("deal_promotion" as never)
    .insert({
      deal_card_id: input.dealCardId,
      base_version: version,
      offered_by_company: companyId,
      offered_by_person: user.id,
      line_deltas: input.lineDeltas,
      condition_deltas: input.conditionDeltas ?? [],
      state: "pending",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error((error as { message: string }).message);
  const promotionId = (data as { id: string } | null)?.id;
  if (!promotionId) throw new Error("offerPromotion: no promotion id returned");

  await writeAudit({
    actorType: "user",
    action: "promotion.offered",
    contentType: "deal_card",
    contentId: input.dealCardId,
    actorPersonId: user.id,
  });

  return { promotionId };
}

/**
 * Accept a promotion (07-06, buyer-only). Applies the reward's line deltas
 * INDEPENDENTLY at accept time (Open Question 2): each reward becomes a REAL
 * `deal_line_item` row at the CURRENT version (D-21). CRITICAL (D-26): this never
 * touches `deal_confirmation` and never bumps the version - Sign stays callable.
 * Non-product rewards (`condition_deltas`) are NOT applied as lines (D-22); they
 * stay on the promotion row and render in Extra Conditions. The buyer side is
 * re-derived from the SESSION (T-07-06-01).
 */
export async function acceptPromotion({
  dealCardId,
}: {
  dealCardId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("acceptPromotion: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("acceptPromotion: no company in session");

  const { version, buyerId } = await dealSides(supabase, dealCardId);
  if (companyId !== buyerId) {
    throw new Error("Only the buyer can accept a promotion.");
  }

  // the card's current pending promotion (newest first; there is no active-row lock).
  const { data: promoData, error: promoErr } = await supabase
    .from("deal_promotion" as never)
    .select("id, line_deltas")
    .eq("deal_card_id", dealCardId)
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (promoErr) throw new Error((promoErr as { message: string }).message);
  const promo = promoData as { id: string; line_deltas: unknown } | null;
  if (!promo) throw new Error("acceptPromotion: no pending promotion to accept.");

  // apply the REAL line deltas onto the current version (D-21). unit_price is NOT
  // NULL, so a free reward carries 0 explicitly. sort_order must be distinct
  // (the (card, version, sort_order) unique key), so continue after the last line.
  const deltas = Array.isArray(promo.line_deltas)
    ? (promo.line_deltas as Array<Record<string, unknown>>)
    : [];
  if (deltas.length) {
    const { data: lastLine } = await supabase
      .from("deal_line_item")
      .select("sort_order")
      .eq("deal_card_id", dealCardId)
      .eq("version", version)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextSort = (lastLine?.sort_order ?? -1) + 1;
    for (const d of deltas) {
      const { error: lineErr } = await supabase.from("deal_line_item").insert({
        deal_card_id: dealCardId,
        version,
        product_id: typeof d["productId"] === "string" ? (d["productId"] as string) : null,
        product_name:
          typeof d["productName"] === "string" && (d["productName"] as string).trim()
            ? (d["productName"] as string)
            : "Promotion reward",
        quantity: Number(d["quantity"] ?? 0),
        unit: typeof d["unit"] === "string" ? (d["unit"] as string) : "g",
        unit_price: Number(d["unitPrice"] ?? 0),
        currency: typeof d["currency"] === "string" ? (d["currency"] as string) : "EUR",
        sort_order: nextSort,
      });
      if (lineErr) throw lineErr;
      nextSort += 1;
    }
  }

  const { error: updErr } = await supabase
    .from("deal_promotion" as never)
    .update({
      state: "accepted",
      resolved_by_person: user.id,
      resolved_at: new Date().toISOString(),
    } as never)
    .eq("id", promo.id);
  if (updErr) throw new Error((updErr as { message: string }).message);

  await logLine(
    supabase,
    dealCardId,
    version,
    user.id,
    "Promotion accepted - the reward was added to the deal.",
  );
  await writeAudit({
    actorType: "user",
    action: "promotion.accepted",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
}

/**
 * Decline a promotion (07-06, buyer-only). Records `state='declined'`; the base
 * deal is left UNCHANGED (no line writes) and Sign is untouched (D-26). The buyer
 * side is re-derived from the SESSION (T-07-06-01).
 */
export async function declinePromotion({
  dealCardId,
}: {
  dealCardId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("declinePromotion: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("declinePromotion: no company in session");

  const { buyerId } = await dealSides(supabase, dealCardId);
  if (companyId !== buyerId) {
    throw new Error("Only the buyer can decline a promotion.");
  }

  const { data: promoData, error: promoErr } = await supabase
    .from("deal_promotion" as never)
    .select("id")
    .eq("deal_card_id", dealCardId)
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (promoErr) throw new Error((promoErr as { message: string }).message);
  const promo = promoData as { id: string } | null;
  if (!promo) throw new Error("declinePromotion: no pending promotion to decline.");

  const { error: updErr } = await supabase
    .from("deal_promotion" as never)
    .update({
      state: "declined",
      resolved_by_person: user.id,
      resolved_at: new Date().toISOString(),
    } as never)
    .eq("id", promo.id);
  if (updErr) throw new Error((updErr as { message: string }).message);

  await writeAudit({
    actorType: "user",
    action: "promotion.declined",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
}

/* -------------------------------------------------------------------------- */
/* Reopen ticket (07-06, RTKT-01) - the post-close path back in (D-29/D-30).   */
/*                                                                            */
/* After a deal closes (`done`, set by the invoice trigger), the ONLY path     */
/* back is a reopen ticket - and EITHER party may open it (D-29). CRITICAL      */
/* (D-29): these move the lifecycle STATUS + append a log note ONLY; they NEVER */
/* mutate the sealed deal terms (line items / conditions). This is DISTINCT     */
/* from the parked C2C ticketing - the inbox primitives are untouched.         */
/* -------------------------------------------------------------------------- */

/**
 * Reopen a closed deal into a ticket (07-06). Allowed for EITHER deal party (the
 * session company must be a member), and only from a closed deal (`done`). Moves
 * the status to `ticket_created` and appends the reopen (+ optional note) to the
 * card log. NEVER changes the sealed terms (T-07-06-03).
 */
export async function reopenTicket({
  dealCardId,
  note,
}: {
  dealCardId: string;
  note?: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("reopenTicket: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("reopenTicket: no company in session");

  const { version, status, sellerId, buyerId } = await dealSides(supabase, dealCardId);
  // EITHER party may reopen - the session company must be one of the two sides.
  if (companyId !== sellerId && companyId !== buyerId) {
    throw new Error("Only a deal party can reopen this deal.");
  }
  // D-29: the ONLY path back is from a closed deal.
  if (status !== "done") {
    throw new Error("Only a closed (executed) deal can be reopened.");
  }

  await updateStatus(supabase, dealCardId, "ticket_created");
  const trimmed = note?.trim();
  await logLine(
    supabase,
    dealCardId,
    version,
    user.id,
    trimmed
      ? `Reopen ticket opened - ${trimmed}`
      : "Reopen ticket opened.",
  );
  await writeAudit({
    actorType: "user",
    action: "deal.reopened",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
}

/**
 * Close a reopen ticket (07-06). Allowed for EITHER deal party, only from
 * `ticket_created`; moves the status to `ticket_closed` and logs it. Like
 * `reopenTicket`, it never touches the sealed terms (T-07-06-03).
 */
export async function closeTicket({
  dealCardId,
}: {
  dealCardId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("closeTicket: no authenticated user");

  const companyId = await getCurrentCompanyId();
  if (!companyId) throw new Error("closeTicket: no company in session");

  const { version, status, sellerId, buyerId } = await dealSides(supabase, dealCardId);
  if (companyId !== sellerId && companyId !== buyerId) {
    throw new Error("Only a deal party can close this ticket.");
  }
  if (status !== "ticket_created") {
    throw new Error("Only an open reopen ticket can be closed.");
  }

  await updateStatus(supabase, dealCardId, "ticket_closed");
  await logLine(supabase, dealCardId, version, user.id, "Reopen ticket closed.");
  await writeAudit({
    actorType: "user",
    action: "deal.ticket_closed",
    contentType: "deal_card",
    contentId: dealCardId,
    actorPersonId: user.id,
  });
}

/* ---- small server-only helpers (not exported) ---- */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolve a card's live version, status, and derived seller/buyer company ids -
 * the shared load for the promotion + reopen actions (07-06). One card read + one
 * relationship read; the sides come from the pure `sellerCompanyId`/
 * `buyerCompanyId` derivation, so a caller only compares its session company
 * against these (never trusting a client-claimed side, T-07-06-01/03).
 */
async function dealSides(
  supabase: ServerClient,
  dealCardId: string,
): Promise<{
  version: number;
  status: DealCardStatus;
  sellerId: string;
  buyerId: string;
}> {
  const { data: card, error: cardErr } = await supabase
    .from("deal_card")
    .select("deal_type, initiating_company_id, relationship_id, version, status")
    .eq("id", dealCardId)
    .single();
  if (cardErr) throw cardErr;

  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;

  const facts = {
    deal_type: card.deal_type as "offer" | "order",
    initiating_company_id: card.initiating_company_id,
  };
  return {
    version: card.version,
    status: card.status as DealCardStatus,
    sellerId: sellerCompanyId(facts, rel.company_a_id, rel.company_b_id),
    buyerId: buyerCompanyId(facts, rel.company_a_id, rel.company_b_id),
  };
}

async function updateStatus(supabase: ServerClient, cardId: string, status: DealCardStatus) {
  const { error } = await supabase
    .from("deal_card")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", cardId);
  if (error) throw error;
}

async function logLine(
  supabase: ServerClient,
  cardId: string,
  version: number,
  personId: string,
  summary: string,
) {
  const { error } = await supabase.from("deal_card_log").insert({
    deal_card_id: cardId,
    version,
    change_summary: summary,
    origin: "deal_chat",
    changed_by: "person",
    changed_by_person_id: personId,
  });
  if (error) throw error;
}
