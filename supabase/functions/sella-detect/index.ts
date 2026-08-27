import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runDetection } from "../_shared/sella/detect.ts";
import type { DetectionMessage, SellerProduct } from "../_shared/sella/context.ts";
import {
  decideSurface,
  productKey,
  surfacedSummary,
  type SurfacedState,
} from "../_shared/sella/dedup.ts";
import { callBedrock, MODELS } from "../_shared/sella/bedrock.ts";
import { DETECT_DEAL_SCHEMA } from "../_shared/sella/tools.ts";
import { DETECT_SYSTEM } from "../_shared/sella/prompts.ts";

// sella-detect (Sella 4b): the data-triggered detection home (the placement rule's
// "background" branch, so the Bedrock key stays in Supabase). Invoked over HTTP with
// { thread_id } for now; step 4 swaps that for the pgmq + pg_cron trigger.
//
// Step 3 (this file): close the loop. It reads the thread + catalogue with the SERVICE
// ROLE (RLS is for people; this is the trusted background worker), runs the detection
// brain, then PERSISTS the outcome:
//   1. idempotency  - skip (no model call) if this exact thread-state was already detected
//   2. memory       - one sella_detection row per run (no_deal included), GDPR-safe
//   3. surface      - post / suppress / supersede the deal_detected chat message (dedup.ts)
// The clicking + birth is step 5; the buttons are 5A. Here votes are just empty slots.

interface AuthorRow {
  first_name: string | null;
  last_name: string | null;
}
interface MsgRow {
  id: string;
  sender: string;
  body: string;
  author: AuthorRow | AuthorRow[] | null;
}
interface ProdRow {
  name: string;
  cultivar: string | null;
  local_code_pzn: string | null;
  unit_code: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Unwrap a PostgREST embed that may type as an object or a single-element array. */
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

Deno.serve(async (req: Request) => {
  let body: { thread_id?: string; warm?: boolean } | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  // Daily grammar pre-warm (cron). Compile/refresh the structured-output grammar with a
  // throwaway 1-line request so the first real detection of the day is not cold (~7s).
  // No DB reads or writes - this path never touches a thread.
  if (body?.warm === true) {
    try {
      await callBedrock({
        model: MODELS.summarize,
        system: DETECT_SYSTEM,
        messages: [{ role: "user", text: "<thread>Person: hello</thread>\nExtract the deal." }],
        jsonSchema: DETECT_DEAL_SCHEMA,
        maxTokens: 64,
      });
      return json({ warmed: true });
    } catch (e) {
      return json({ warmed: false, error: (e as Error).message }, 200);
    }
  }

  const threadId: string | undefined = body?.thread_id;
  if (!threadId) return json({ error: "POST a JSON body { thread_id } or { warm: true }" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = createClient(url, serviceKey);

  // the thread (-> its relationship) + the whole message stream, oldest first
  const { data: thread, error: tErr } = await supabase
    .from("chat_thread")
    .select("id, relationship_id")
    .eq("id", threadId)
    .single();
  if (tErr || !thread) return json({ error: `thread not found: ${tErr?.message ?? "no row"}` }, 404);

  // HEL-84 (0026-relationship-write-gate): gate BEFORE the idempotency claim
  // (sella_detection insert, below) and the Bedrock call (runDetection) — a
  // suspended/ended relationship must not pay for either on a run that was
  // always going to be refused. This also means NO sella_detection memory row
  // is written for a suspended-relationship run, unlike every other outcome
  // of this function, which always writes one — a distinct, deliberate fact,
  // not a gap in the memory trail.
  const { error: notWritableErr } = await supabase.rpc("assert_relationship_writable", {
    p_relationship_id: thread.relationship_id,
  });
  if (notWritableErr) {
    return json({ thread_id: threadId, skipped: "relationship not writable" }, 200);
  }

  // PERSON messages only - the actual buyer/seller negotiation. Sella's own lines
  // (deal_detected, intro) and system lines (connection_established) are NOT part of the
  // conversation: including them would let Sella's own post bump the idempotency key and
  // re-trigger her, and would feed her prior notes back as if they were negotiation.
  const { data: msgData, error: mErr } = await supabase
    .from("chat_message")
    .select(
      "id, sender, body, created_at, author:person!chat_message_sender_person_id_fkey(first_name, last_name)",
    )
    .eq("thread_id", threadId)
    .eq("sender", "person")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (mErr) return json({ error: `messages: ${mErr.message}` }, 500);

  const rows = (msgData ?? []) as unknown as MsgRow[];
  // the idempotency key: the newest PERSON message at run time. None => nothing to detect.
  const lastMessageId = rows.length ? rows[rows.length - 1].id : null;
  if (!lastMessageId) return json({ thread_id: threadId, skipped: "empty thread" }, 200);

  // 1. IDEMPOTENCY (cost guard): if this exact thread-state was already detected, stop
  // BEFORE the model call - nothing has changed since, so there is nothing new to find.
  const { data: already } = await supabase
    .from("sella_detection")
    .select("id")
    .eq("thread_id", threadId)
    .eq("last_message_id", lastMessageId)
    .maybeSingle();
  if (already) {
    return json({ thread_id: threadId, last_message_id: lastMessageId, skipped: "idempotent" }, 200);
  }

  // the relationship's two companies -> their products (seller = the side with a catalogue)
  const { data: rel } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", thread.relationship_id)
    .single();
  const companyIds = [rel?.company_a_id, rel?.company_b_id].filter(
    (x): x is string => Boolean(x),
  );

  const { data: prodData } = await supabase
    .from("product")
    .select("name, cultivar, local_code_pzn, unit_code")
    .in("company_id", companyIds)
    .is("deleted_at", null);

  const messages: DetectionMessage[] = rows.map((m) => {
    const a = one(m.author);
    const name = a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : null;
    return { sender: m.sender, authorName: name || null, body: m.body };
  });
  const sellerProducts: SellerProduct[] = ((prodData ?? []) as unknown as ProdRow[]).map((p) => ({
    name: p.name,
    cultivar: p.cultivar,
    pzn: p.local_code_pzn,
    unit: p.unit_code,
  }));

  // the last preview Sella surfaced on this thread - fed back into the prompt (so she
  // does not re-surface it) and used to decide post/suppress/supersede (dedup.ts).
  const { data: prevRow } = await supabase
    .from("sella_detection")
    .select("verdict, draft, surfaced_message_id")
    .eq("thread_id", threadId)
    .not("surfaced_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev: SurfacedState | null = prevRow?.surfaced_message_id
    ? {
      verdict: prevRow.verdict as string,
      draft: prevRow.draft as SurfacedState["draft"],
      surfacedMessageId: prevRow.surfaced_message_id as string,
    }
    : null;

  // 2. RUN the brain. fail-soft: a bad result writes NO row (so a retry can re-run) and
  // leaves the chat untouched.
  const outcome = await runDetection({
    messages,
    sellerProducts,
    lastSurfacedSummary: surfacedSummary(prev),
  });
  if (!outcome.ok) {
    return json({ thread_id: threadId, last_message_id: lastMessageId, outcome }, 200);
  }

  const deal = outcome.isDeal ? outcome.result.deal : null;
  const decision = decideSurface(prev, {
    isDeal: outcome.isDeal,
    verdict: outcome.result.verdict,
    deal,
  });

  // 3a. MEMORY: claim the idempotency slot + record the run. GDPR: keep the draft,
  // product_key and verbatim evidence ONLY on a real surfaceable deal; a no_deal (or an
  // ungrounded verdict) stores just verdict + confidence.
  const { data: inserted, error: insErr } = await supabase
    .from("sella_detection")
    .insert({
      thread_id: threadId,
      last_message_id: lastMessageId,
      verdict: outcome.result.verdict,
      confidence: outcome.result.confidence,
      product_key: outcome.isDeal ? productKey(deal) : null,
      draft: outcome.isDeal ? deal : null,
      evidence: outcome.isDeal ? outcome.evidence : null,
      surfaced_message_id: null,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    // a concurrent run already claimed this thread-state (unique index) -> idempotent.
    return json(
      { thread_id: threadId, last_message_id: lastMessageId, skipped: "idempotent-race" },
      200,
    );
  }
  const detectionId = inserted.id as string;

  // 3b. SURFACE: carry out the dedup decision against the chat.
  async function postDetectedMessage(): Promise<string | null> {
    // votes: one empty slot per company side. 5A fills these; step 5 births on both-accept.
    const votes: Record<string, null> = {};
    if (rel?.company_a_id) votes[rel.company_a_id] = null;
    if (rel?.company_b_id) votes[rel.company_b_id] = null;

    const { data: msg, error: msgErr } = await supabase
      .from("chat_message")
      .insert({
        thread_id: threadId,
        sender: "sella",
        sender_person_id: null,
        type: "deal_detected",
        body: `Sella spotted a deal: ${deal?.summary ?? "see details"}`,
        metadata: {
          detection_id: detectionId,
          verdict: outcome.result.verdict,
          confidence: outcome.result.confidence,
          draft: deal,
          evidence: outcome.evidence,
          votes,
          product_key: productKey(deal),
          superseded_by: null,
          ai: true, // EU AI Act Art. 50 machine-readable AI-origin tag
        },
      })
      .select("id")
      .single();
    if (msgErr || !msg) return null;
    return msg.id as string;
  }

  let surfacedMessageId: string | null = null;
  if (decision.kind === "suppress") {
    // a repeat: keep pointing the memory row at the still-live preview, post nothing.
    surfacedMessageId = decision.keepMessageId;
  } else if (decision.kind === "post") {
    surfacedMessageId = await postDetectedMessage();
  } else if (decision.kind === "supersede") {
    surfacedMessageId = await postDetectedMessage();
    if (surfacedMessageId) {
      // mark the prior preview superseded so 5A collapses it and its votes don't carry over
      const { data: old } = await supabase
        .from("chat_message")
        .select("metadata")
        .eq("id", decision.previousMessageId)
        .single();
      const merged = { ...((old?.metadata as Record<string, unknown>) ?? {}), superseded_by: surfacedMessageId };
      await supabase.from("chat_message").update({ metadata: merged }).eq("id", decision.previousMessageId);
    }
  }
  // decision.kind === "none" -> memory row only, surfaced stays null.

  if (surfacedMessageId) {
    await supabase
      .from("sella_detection")
      .update({ surfaced_message_id: surfacedMessageId })
      .eq("id", detectionId);
  }

  return json({
    thread_id: threadId,
    messageCount: messages.length,
    productCount: sellerProducts.length,
    last_message_id: lastMessageId,
    detection_id: detectionId,
    verdict: outcome.result.verdict,
    confidence: outcome.result.confidence,
    isDeal: outcome.isDeal,
    decision: decision.kind,
    surfaced_message_id: surfacedMessageId,
  });
});
