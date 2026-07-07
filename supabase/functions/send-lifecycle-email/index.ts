import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderTemplate, type LifecycleEvent } from "../_shared/email/templates.ts";
import { sendViaResend } from "../_shared/email/resend.ts";

// send-lifecycle-email (SET-03): the first app-level email-send path. Mirrors sella-intro
// exactly — a service-role Deno.serve handler that resolves its target from the DB and
// leaves the secret in the edge runtime. The CALLER passes IDs only (never an email
// address); this function resolves the recipient from auth.users (the SSOT;
// person.email_encrypted was dropped 2026-05-27), renders the per-event TS template, and
// POSTs to Resend. Fire-and-forget wiring from each event's server action is 13-11.
//
// Recipient resolution (server-side, T-13-05-S / T-13-05-I2):
//   join.requested                      → every Superadmin of the TARGET company (fan-out)
//   verification.approved / .rejected   → the company founder (company.created_by)
//   welcome                             → the new user (person_id), founder-resolved if absent
//   join.approved / .rejected / removed → the target person (person_id)
// No recipient email is ever echoed back to the caller — the response carries only counts.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Wrapping createClient lets `Supa` capture the client type as actually inferred from a
// real call. createClient's own signature defaults its schema generics to `never`, so a
// bare `ReturnType<typeof createClient>` would not match `createClient(url, key)` and the
// helper `.from(...)` rows would collapse to `never`.
function makeServiceClient(url: string, key: string) {
  return createClient(url, key);
}
type Supa = ReturnType<typeof makeServiceClient>;

const LIFECYCLE_EVENTS: ReadonlySet<string> = new Set<LifecycleEvent>([
  "verification.approved",
  "verification.rejected",
  "join.requested",
  "join.approved",
  "join.rejected",
  "welcome",
  "membership.removed",
]);

// Events that resolve to the company founder when only a company_id is supplied.
const FOUNDER_EVENTS: ReadonlySet<string> = new Set<LifecycleEvent>([
  "verification.approved",
  "verification.rejected",
  "welcome",
]);

// The active Superadmin person ids of a company (join.requested fan-out). Mirrors
// current_superadmin_group_id(): the company's active group named 'Superadmin', then its
// active person_group members.
async function superadminPersonIds(supabase: Supa, companyId: string): Promise<string[]> {
  const { data: grp } = await supabase
    .from("group")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", "Superadmin")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!grp?.id) return [];

  const { data: members } = await supabase
    .from("person_group")
    .select("person_id")
    .eq("group_id", grp.id)
    .is("deleted_at", null);
  return (members ?? []).map((m) => m.person_id as string).filter(Boolean);
}

// The founder person id of a company (company.created_by).
async function companyFounderId(supabase: Supa, companyId: string): Promise<string | null> {
  const { data: company } = await supabase
    .from("company")
    .select("created_by")
    .eq("id", companyId)
    .maybeSingle();
  return (company?.created_by as string | null) ?? null;
}

// Resolve the recipient PERSON ids for an event — never trusting a caller-supplied email.
async function resolvePersonIds(
  supabase: Supa,
  event: LifecycleEvent,
  personId: string | undefined,
  companyId: string | undefined,
): Promise<string[]> {
  if (event === "join.requested") {
    return companyId ? await superadminPersonIds(supabase, companyId) : [];
  }
  if (personId) return [personId];
  if (FOUNDER_EVENTS.has(event) && companyId) {
    const founderId = await companyFounderId(supabase, companyId);
    return founderId ? [founderId] : [];
  }
  return [];
}

// Per-recipient template vars: personalised greeting (first name) + company context +
// the (already caller-supplied) reason. All resolved server-side.
async function buildVars(
  supabase: Supa,
  personId: string,
  companyId: string | undefined,
  reason: string | null | undefined,
): Promise<Record<string, unknown>> {
  const vars: Record<string, unknown> = {};
  if (reason) vars.reason = reason;

  const { data: person } = await supabase
    .from("person")
    .select("first_name")
    .eq("id", personId)
    .maybeSingle();
  if (person?.first_name) vars.name = person.first_name;

  if (companyId) {
    const { data: company } = await supabase
      .from("company")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();
    if (company?.name) vars.company_name = company.name;
  }
  return vars;
}

Deno.serve(async (req: Request) => {
  let body:
    | { event?: string; person_id?: string; company_id?: string; reason?: string | null }
    | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const event = body?.event;
  if (!event || !LIFECYCLE_EVENTS.has(event)) {
    return json({ error: "POST { event, person_id?, company_id?, reason? } with a known event" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = makeServiceClient(url, serviceKey);

  const lifecycleEvent = event as LifecycleEvent;
  const personIds = await resolvePersonIds(
    supabase,
    lifecycleEvent,
    body?.person_id,
    body?.company_id,
  );
  if (personIds.length === 0) {
    return json({ skipped: "no recipient" }, 200);
  }

  // person id -> email (auth.users SSOT), render, send. Aggregate to counts only —
  // never leak a resolved address back to the caller (T-13-05-I2).
  let attempted = 0;
  let sentCount = 0;
  for (const personId of personIds) {
    const { data: userRow } = await supabase.auth.admin.getUserById(personId);
    const to = userRow?.user?.email;
    if (!to) continue;

    attempted++;
    const vars = await buildVars(supabase, personId, body?.company_id, body?.reason);
    const { subject, html } = renderTemplate(lifecycleEvent, vars);
    const { ok } = await sendViaResend(to, subject, html);
    if (ok) sentCount++;
  }

  if (attempted === 0) return json({ skipped: "no recipient" }, 200);
  return json({ sent: sentCount === attempted, recipients: attempted });
});
