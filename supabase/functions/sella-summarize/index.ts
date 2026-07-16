import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runSummary, type SummaryLine } from "../_shared/sella/summarize.ts";

// sella-summarize (Sella 4d): the "why it changed" summary. An edit is PERSON-WAITING
// (a human just clicked Update), so by the placement rule it is triggered INLINE by the
// editDeal server action - but the Bedrock call lives HERE so the key stays in Supabase
// (Path A). It reads the before/after versions + the editor's note, asks Haiku for one
// neutral sentence, and writes it BOTH to deal_card_log AND as a `deal_card_updated`
// message in the deal workspace chat (decision: chat line AND log). Fail-soft throughout.
//
// OBS-3 / D-10: the mechanical narration author is `system` (neutral audit voice), NOT
// `sella` - Sella is a functionless placeholder this phase, so the brand is not attached
// to auto-narration. Both the log's `changed_by` and the chat message `sender` are
// 'system'; the idempotency probe matches the same author. The `ai: true` metadata tag
// STAYS (the summary is still Haiku-generated - Art. 50 transparency is about provenance,
// not display author). Safe: the sella_detect trigger fires only on sender='person'.

interface LineRow {
  product_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  currency: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toLines(rows: LineRow[]): SummaryLine[] {
  return rows.map((r) => ({
    name: r.product_name,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    currency: r.currency,
  }));
}

Deno.serve(async (req: Request) => {
  let body: { deal_card_id?: string; version?: number } | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const cardId = body?.deal_card_id;
  if (!cardId) return json({ error: "POST a JSON body { deal_card_id, version? }" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = createClient(url, serviceKey);

  const { data: card, error: cErr } = await supabase
    .from("deal_card")
    .select("id, version, relationship_id")
    .eq("id", cardId)
    .single();
  if (cErr || !card) return json({ error: `card not found: ${cErr?.message ?? "no row"}` }, 404);

  const vNew = body?.version ?? (card.version as number);
  const vOld = vNew - 1;
  if (vOld < 1) return json({ deal_card_id: cardId, version: vNew, skipped: "no prior version (creation, not an edit)" }, 200);

  // idempotency: summarize each version at most once. The probe MUST match the
  // author the log is written under below (OBS-3: 'system'), or it would never
  // find the prior row and re-summarize on every call.
  const { data: existing } = await supabase
    .from("deal_card_log")
    .select("id")
    .eq("deal_card_id", cardId)
    .eq("version", vNew)
    .eq("changed_by", "system")
    .maybeSingle();
  if (existing) {
    return json({ deal_card_id: cardId, version: vNew, skipped: "already summarized" }, 200);
  }

  // before/after line snapshots (old version is frozen)
  const { data: newRows } = await supabase
    .from("deal_line_item")
    .select("product_name, quantity, unit, unit_price, currency")
    .eq("deal_card_id", cardId).eq("version", vNew).order("sort_order");
  const { data: oldRows } = await supabase
    .from("deal_line_item")
    .select("product_name, quantity, unit, unit_price, currency")
    .eq("deal_card_id", cardId).eq("version", vOld).order("sort_order");

  // the editor's MANDATORY note for this version: the person log row at vNew -> its note
  const { data: logRow } = await supabase
    .from("deal_card_log")
    .select("id")
    .eq("deal_card_id", cardId).eq("version", vNew).eq("changed_by", "person")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let note = "";
  if (logRow?.id) {
    const { data: ni } = await supabase
      .from("deal_change_input")
      .select("note")
      .eq("log_id", logRow.id)
      .maybeSingle();
    note = (ni?.note as string) ?? "";
  }

  const outcome = await runSummary({
    oldVersion: vOld,
    newVersion: vNew,
    oldLines: toLines((oldRows ?? []) as unknown as LineRow[]),
    newLines: toLines((newRows ?? []) as unknown as LineRow[]),
    note,
  });
  if (!outcome.ok) return json({ deal_card_id: cardId, version: vNew, outcome }, 200);

  // 1. the log line (changed_by='system', OBS-3) - shows in the card's Logs tab
  await supabase.from("deal_card_log").insert({
    deal_card_id: cardId,
    version: vNew,
    change_summary: outcome.summary,
    origin: "deal_chat",
    changed_by: "system",
    changed_by_person_id: null,
  });

  // 2. the deal_card_updated summary -> BOTH the deal workspace chat AND the relationship's
  // P2P chat. The same card lives in both, and the people's home base is the P2P chat, so
  // the awareness must follow them there instead of forcing them into the workspace. Each
  // message links to the card via metadata.deal_card_id (a P2P chat can host several deals).
  const { data: dealThread } = await supabase
    .from("chat_thread").select("id")
    .eq("deal_card_id", cardId).eq("type", "deal").maybeSingle();
  const { data: p2pThread } = await supabase
    .from("chat_thread").select("id")
    .eq("relationship_id", card.relationship_id).eq("type", "p2p").maybeSingle();

  const targets = [dealThread?.id, p2pThread?.id].filter((x): x is string => Boolean(x));
  const postedTo: string[] = [];
  for (const threadId of targets) {
    const { error: mErr } = await supabase.from("chat_message").insert({
      thread_id: threadId,
      sender: "system", // OBS-3/D-10: neutral audit voice while Sella is a placeholder
      sender_person_id: null,
      type: "deal_card_updated",
      body: outcome.summary,
      metadata: { deal_card_id: cardId, version: vNew, ai: true }, // ai:true = Art. 50 tag (still Haiku-generated)
    });
    if (!mErr) postedTo.push(threadId);
  }

  return json({
    deal_card_id: cardId,
    version: vNew,
    summary: outcome.summary,
    log_written: true,
    threads_posted: postedTo.length, // deal chat + P2P chat
  });
});
