import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runDetection } from "../_shared/sella/detect.ts";
import type { DetectionMessage, SellerProduct } from "../_shared/sella/context.ts";

// sella-detect (Sella 4b): the data-triggered detection home (the placement rule's
// "background" branch, so the Bedrock key stays in Supabase). For now it is invoked
// over HTTP with { thread_id }; step 4 swaps that for the pgmq + pg_cron trigger.
//
// It reads the thread + the relationship's catalogue with the SERVICE ROLE - RLS is
// for people, this is the trusted background worker - runs the detection brain, and
// returns the outcome. The `deal_detected` message write + dedup land in the next step.

interface AuthorRow {
  first_name: string | null;
  last_name: string | null;
}
interface MsgRow {
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
  let threadId: string | undefined;
  try {
    const body = await req.json();
    threadId = body?.thread_id;
  } catch {
    threadId = undefined;
  }
  if (!threadId) return json({ error: "POST a JSON body { thread_id }" }, 400);

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

  const { data: msgData, error: mErr } = await supabase
    .from("chat_message")
    .select(
      "sender, body, created_at, author:person!chat_message_sender_person_id_fkey(first_name, last_name)",
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (mErr) return json({ error: `messages: ${mErr.message}` }, 500);

  // the relationship's two companies -> their products (the seller is the side with a catalogue)
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

  const messages: DetectionMessage[] = ((msgData ?? []) as unknown as MsgRow[]).map((m) => {
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

  const outcome = await runDetection({ messages, sellerProducts, lastSurfacedSummary: null });
  return json({
    thread_id: threadId,
    messageCount: messages.length,
    productCount: sellerProducts.length,
    outcome,
  });
});
