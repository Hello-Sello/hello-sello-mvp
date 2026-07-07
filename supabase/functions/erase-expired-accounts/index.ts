import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// erase-expired-accounts (Phase 13 SET-02, async half): the day-30 GDPR erasure
// sweep. pg_cron (public.run_scheduled_erasures) POSTs here daily; this worker
// pseudonymizes every account whose 30-day deletion runway has elapsed.
//
// NON-DESTRUCTIVE: BOTH the person row and the auth.users row are KEPT. person.id
// references auth.users(id) ON DELETE CASCADE, and audit_log.actor_person_id
// references person(id) — so hard-removing either row cascades into the append-only
// audit chain and corrupts it. Instead, per due row, in order:
//   1. scrub_person_pii   — empty the six PII columns + set anonymized_at (row kept)
//   2. updateUserById     — tombstone the auth.users email (the SSOT identifier)
//   3. deleteUser(soft)   — disable login WITHOUT removing the row (shouldSoftDelete)
//   4. audit_person_scrub — record person.gdpr_scrubbed (company-less-guarded)
//
// Uses SUPABASE_SERVICE_ROLE_KEY (a real JWT service role) because the edge
// runtime's admin API accepts it locally, unlike the Next sb_secret_ key which
// 403s the local GoTrue admin API (team/actions.ts:18-23, RESEARCH A3).
//
// Trust: the worker only ever touches rows already past their OWN
// deletion_scheduled_for, and every step is idempotent — so even a non-cron caller
// can do no more than the already-due work (threat T-13-03-T mitigation).

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (_req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const supabase = createClient(url, serviceKey);

  // Due = past its own 30-day runway AND not yet pseudonymized (idempotent select).
  const nowIso = new Date().toISOString();
  const { data: due, error: selErr } = await supabase
    .from("person")
    .select("id")
    .lte("deletion_scheduled_for", nowIso)
    .is("anonymized_at", null);
  if (selErr) return json({ error: selErr.message }, 500);

  const rows = due ?? [];
  let erased = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of rows) {
    const id = row.id as string;
    try {
      // 1. Scrub the person PII in place (row KEPT). Idempotent via anonymized_at.
      const { error: scrubErr } = await supabase.rpc("scrub_person_pii", { p_id: id });
      if (scrubErr) throw new Error(`scrub: ${scrubErr.message}`);

      // 2. Tombstone the auth.users email (the SSOT identifier) + clear the auth
      //    metadata that carries the signup name. Email stays unique + inert.
      const { error: tombErr } = await supabase.auth.admin.updateUserById(id, {
        email: `${id}@deleted.hello-sello.invalid`,
        user_metadata: {},
        app_metadata: {},
      });
      if (tombErr) throw new Error(`tombstone: ${tombErr.message}`);

      // 3. Disable login. shouldSoftDelete=true KEEPS the auth.users row (a hard
      //    removal would cascade into person + break the append-only audit chain).
      const shouldSoftDelete = true;
      const { error: delErr } = await supabase.auth.admin.deleteUser(id, shouldSoftDelete);
      if (delErr) throw new Error(`softDelete: ${delErr.message}`);

      // 4. Compliance audit (company-less-guarded + idempotent, both in SQL).
      const { error: auditErr } = await supabase.rpc("audit_person_scrub", { p_person_id: id });
      if (auditErr) throw new Error(`audit: ${auditErr.message}`);

      erased++;
    } catch (e) {
      // Fail-soft: one poison row must not abort the batch — it re-queues next day
      // (still due, still not anonymized) and the sweep self-heals.
      failures.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ erased, failed: failures.length, total: rows.length, failures });
});
