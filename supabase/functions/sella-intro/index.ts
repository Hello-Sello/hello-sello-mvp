import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runIntro } from "../_shared/sella/intro.ts";

// sella-intro (Sella 4d): the warm first-contact intro. Accepting a request is
// PERSON-WAITING (a human just clicked Accept), so it is triggered INLINE by the
// acceptItem action - but the Bedrock call lives HERE so the key stays in Supabase
// (Path A). The rollout already seeded a STATIC `sella`/`intro` line into the P2P
// thread; this rewrites that one line with a Haiku-generated, context-aware opener and
// tags it AI-origin. Fail-soft: if Sella is down the static intro stays untouched.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  let body:
    | {
      relationship_id?: string;
      request_type?: string;
      note?: string | null;
      sender_company?: string;
      sender_person?: string;
      recipient_company?: string;
      recipient_person?: string;
    }
    | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const relId = body?.relationship_id;
  if (!relId) return json({ error: "POST a JSON body { relationship_id, ... }" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = createClient(url, serviceKey);

  // the P2P thread of this relationship + its seeded sella/intro line
  const { data: thread } = await supabase
    .from("chat_thread")
    .select("id")
    .eq("relationship_id", relId).eq("type", "p2p")
    .maybeSingle();
  if (!thread?.id) return json({ relationship_id: relId, skipped: "no p2p thread" }, 200);

  const { data: introMsg } = await supabase
    .from("chat_message")
    .select("id, metadata")
    .eq("thread_id", thread.id).eq("sender", "sella").eq("type", "intro")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!introMsg?.id) return json({ relationship_id: relId, skipped: "no intro message" }, 200);

  // idempotency: do not regenerate an already-AI intro
  if ((introMsg.metadata as Record<string, unknown> | null)?.generated === true) {
    return json({ relationship_id: relId, skipped: "already generated" }, 200);
  }

  const outcome = await runIntro({
    requestType: body?.request_type ?? "connect_message",
    note: body?.note ?? null,
    senderCompany: body?.sender_company ?? "",
    senderPerson: body?.sender_person ?? "",
    recipientCompany: body?.recipient_company ?? "",
    recipientPerson: body?.recipient_person ?? "",
  });
  if (!outcome.ok) return json({ relationship_id: relId, outcome }, 200);

  const { error: uErr } = await supabase
    .from("chat_message")
    .update({
      body: outcome.intro,
      metadata: { ai: true, generated: true }, // ai:true = EU AI Act Art. 50 tag
    })
    .eq("id", introMsg.id);

  return json({
    relationship_id: relId,
    message_id: introMsg.id,
    intro: outcome.intro,
    updated: !uErr,
  });
});
