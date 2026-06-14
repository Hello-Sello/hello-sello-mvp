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
import type {
  ConfirmDecision,
  ConfirmResult,
  CreateDealInput,
  CreateDealResult,
  DealCardStatus,
  EditDealInput,
  EditDealResult,
  ProposeDealInput,
  ProposeDealResult,
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
    await updateStatus(supabase, card.id, "withdrawn");
    await logLine(supabase, card.id, args.version, user.id, "Draft withdrawn by the initiating side.");
    await writeAudit({
      actorType: "user",
      action: "deal.withdrawn",
      contentType: "deal_card",
      contentId: card.id,
      actorPersonId: user.id,
    });
    return { cardStatus: "withdrawn", bothConfirmed: false };
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

  if (bothConfirmed && card.status === "draft") {
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
 * Create a draft deal card from a chat (3.5a). The SINGLE human-pressed commit:
 * only this action, triggered by a human Create button, writes a deal - Sella
 * may FILL the form but never calls this directly (the AI fence).
 *
 * The whole deal is born in ONE transaction by the `create_deal_draft` SECURITY
 * DEFINER RPC: the card (draft, v1) + line items + the creator's own-side
 * private box + its container (workspace + creator-as-owner + the deal chat
 * thread + an opening line) + the creation log line + the optional note. One
 * transaction = no orphan cards, and it sidesteps the workspace-membership
 * bootstrap that RLS cannot satisfy at a deal's birth. The RPC derives the
 * creator's company from the session and gates on relationship membership (the
 * guardrail). Audit (`deal.created`) stays here so the hash-chain helper owns it.
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
  const { data: cardId, error } = await supabase.rpc("create_deal_draft" as never, {
    p_relationship_id: input.relationshipId,
    p_deal_type: "offer",
    p_value_net: sumValueNet(input.lines),
    p_currency: currency,
    p_due_date: input.dueDate ?? null,
    p_payment_terms_code: input.paymentTermsCode ?? null,
    p_free_delivery: input.freeDelivery ?? false,
    p_lines: rpcLines(input.lines),
    p_private_value: input.privateValue ?? null,
    p_note: input.note ?? null,
  } as never);
  if (error) throw new Error((error as { message: string }).message);
  const newCardId = cardId as string | null;
  if (!newCardId) throw new Error("createDeal: no card id returned from create_deal_draft");

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
 * Propose a deal from a chat (Waypoint 4.5.1) - the manual door's NEW commit.
 *
 * Unlike `createDeal`, this does NOT birth a card. It writes a `deal_detected`
 * PROPOSAL message into the p2p thread (via the `propose_deal` SECURITY DEFINER
 * RPC), with the proposer's own side pre-voted `accept` (sending IS the
 * proposer's yes). The card is born only when the OTHER side accepts, through the
 * unified `confirm_detected_deal` birth - one birth path, two doors (Sella detect
 * + this manual propose). The AI fence still holds: a human's Send press writes
 * the suggestion; a human's Accept press writes the deal.
 *
 * Privacy: the proposal is a shared chat message, so the proposer's own-side
 * private box is NOT carried here (it would leak to the other side); it is added
 * after birth via edit. No audit here - a proposal is not yet a deal; the audited
 * `deal.created` moment is the birth.
 */
export async function proposeDeal(input: ProposeDealInput): Promise<ProposeDealResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("proposeDeal: no authenticated user");

  const currency = input.lines[0]?.currency ?? "EUR";

  // The shared draft: line_items use the SAME keys the confirm_detected_deal
  // birth reads (name, quantity, unit, unit_price, cultivar, pzn). Shared facts
  // only - no private box (privacy).
  const draft = {
    line_items: input.lines.map((l) => ({
      name: l.productName,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unitPrice,
      cultivar: l.cultivar ?? null,
      pzn: l.pzn ?? null,
    })),
    currency,
    summary: draftSummary(input.lines),
    due_date: input.dueDate ?? null,
    payment_terms_code: input.paymentTermsCode ?? null,
    free_delivery: input.freeDelivery ?? false,
    note: input.note ?? null,
  };

  const { data: messageId, error } = await supabase.rpc("propose_deal" as never, {
    p_thread_id: input.threadId,
    p_draft: draft,
  } as never);
  if (error) throw new Error((error as { message: string }).message);
  const newMessageId = messageId as string | null;
  if (!newMessageId) throw new Error("proposeDeal: no message id returned from propose_deal");

  return { messageId: newMessageId };
}

/**
 * Edit a deal into a NEW version (3.5b). The human-pressed commit for a change:
 * one atomic `edit_deal_draft` RPC bumps the version, snapshots the new lines
 * (old version stays frozen), carries the private boxes forward, drops the card
 * back to `draft` (so 3d's gate re-runs), and records the MANDATORY note. The
 * note is required (the RPC also enforces it). Audit = `deal.amended`.
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
    p_private_value: input.privateValue ?? null,
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

/* ---- small server-only helpers (not exported) ---- */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

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
