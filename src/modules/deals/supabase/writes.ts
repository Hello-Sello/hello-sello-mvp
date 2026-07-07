/**
 * Deals module - client-side writes (3c).
 *
 * The workspace screen is a client component reading via the browser Supabase
 * client; ticks write through the SAME client so RLS applies and the UI stays
 * snappy. RLS `thing_all` (FOR ALL, can_access_workspace) lets a deal member
 * flip a Thing. Audit is NOT wired here - see the 3c plan's "Audit deferred"
 * note (no `thing.*` action code exists yet, and writeAudit is server-only).
 */
import { createClient } from "@/shared/db/client";
import type { ThingStatus, ThingType, ThingView } from "../types";

/**
 * Flip one Thing between open and done. When marking done we stamp
 * `completed_at` + `completed_by_person_id` (the viewer); reopening clears both.
 * Returns the new status so the caller can reconcile optimistic UI. Throws on
 * an RLS or write error (the caller surfaces it).
 */
export async function toggleThingStatus(
  thingId: string,
  next: ThingStatus,
): Promise<ThingStatus> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("toggleThingStatus: no authenticated user");

  const done = next === "done";
  const { error } = await supabase
    .from("thing")
    .update({
      status: next,
      completed_at: done ? new Date().toISOString() : null,
      completed_by_person_id: done ? user.id : null,
      updated_by: user.id,
    })
    .eq("id", thingId);
  if (error) throw error;

  return next;
}

/**
 * Create a new Thing (user-added). Things are now FLAT/stageless (D-15: Stages
 * retired), so no stage is passed - the row inserts with `stage_code` NULL (the
 * column was made nullable in 20260707130100). Defaults to a `task` (the common
 * case; the special `approval`/`document_upload` kinds stay available). The caller
 * passes `sortOrder` (it knows the list's current count) so the new row lands at
 * the end. RLS `thing_all` lets a member insert. Returns the created row as a
 * ThingView so the caller can append it in place.
 */
export async function createThing(args: {
  workspaceId: string;
  title: string;
  sortOrder: number;
  type?: ThingType;
  /** the person this Thing is assigned to (D-09); null/absent = unassigned. */
  assigneePersonId?: string | null;
  /** D-10: own-side default PRIVATE; other-side = false/shared. Defaults to shared. */
  isPrivate?: boolean;
  /** the owning company (D-10/D-11); the caller derives it from the session. */
  ownerCompanyId?: string | null;
}): Promise<ThingView> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("createThing: no authenticated user");

  const type: ThingType = args.type ?? "task";
  const isPrivate = args.isPrivate ?? false;
  // is_private / owner_company_id are not in the generated insert type yet, so the
  // insert object is cast (same as-never discipline as the reads). DO NOT regen.
  // stage_code is omitted (nullable now) - Things are flat/stageless (D-15).
  const { data, error } = await supabase
    .from("thing")
    .insert({
      deal_workspace_id: args.workspaceId,
      title: args.title.trim(),
      type,
      status: "open",
      sort_order: args.sortOrder,
      assignee_person_id: args.assigneePersonId ?? null,
      is_private: isPrivate,
      owner_company_id: args.ownerCompanyId ?? null,
      created_by: user.id,
    } as never)
    .select(
      "id, title, type, status, sort_order, assignee_person_id, is_private, owner_company_id" as "id, title, type, status, sort_order",
    )
    .single();
  if (error) throw error;

  const v = data as unknown as {
    assignee_person_id: string | null;
    is_private: boolean;
    owner_company_id: string | null;
  };
  return {
    id: data.id,
    title: data.title,
    type: data.type as ThingType,
    status: data.status as ThingStatus,
    sortOrder: data.sort_order,
    assigneePersonId: v.assignee_person_id ?? null,
    isPrivate: v.is_private ?? false,
    ownerCompanyId: v.owner_company_id ?? null,
  };
}

/**
 * Flip a Thing's visibility between private and shared (Phase 5, D-10). A single
 * `thing` update, modelled on toggleThingStatus (auth guard, throw on error).
 * RLS hides the OTHER side's private rows, so this can only ever touch a row the
 * viewer is allowed to see/flip (T-05-02). When flipping to shared the caller may
 * clear `ownerCompanyId`; when keeping/flipping to private it is the owning side.
 * The new columns are not in the generated update type, so the object is cast.
 */
export async function setThingVisibility(
  thingId: string,
  isPrivate: boolean,
  ownerCompanyId: string | null,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("setThingVisibility: no authenticated user");

  const { error } = await supabase
    .from("thing")
    .update({
      is_private: isPrivate,
      owner_company_id: ownerCompanyId,
      updated_by: user.id,
    } as never)
    .eq("id", thingId);
  if (error) throw error;
}

/**
 * Assign a Thing to a person + record the owning company (Phase 5, D-09/D-10).
 * A single `thing` update. Per D-10 the CALLER derives visibility: assigning to
 * the OTHER company means owner_company_id = the other company and is_private
 * must be false (auto-shared); assigning to your OWN side keeps the current
 * private/shared choice.
 *
 * `isPrivate` is OPTIONAL (ME-01): when provided, the assignee, owner, AND
 * visibility are set in ONE atomic update so "assign to the other company +
 * auto-share" is a single write (one revert, one busy entry) - no partial-
 * failure window where the Thing is owner=other but still is_private=true. When
 * omitted (own-side assign), the current private/shared choice is left untouched.
 */
export async function assignThing(
  thingId: string,
  assigneePersonId: string | null,
  ownerCompanyId: string | null,
  isPrivate?: boolean,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("assignThing: no authenticated user");

  const patch: Record<string, unknown> = {
    assignee_person_id: assigneePersonId,
    owner_company_id: ownerCompanyId,
    updated_by: user.id,
  };
  // only touch is_private when the caller asked to (own-side assign keeps the
  // existing visibility; other-side assign sets is_private=false in the SAME write).
  if (isPrivate !== undefined) patch.is_private = isPrivate;

  const { error } = await supabase
    .from("thing")
    .update(patch as never)
    .eq("id", thingId);
  if (error) throw error;
}

/**
 * Upload the seller's invoice PDF (Phase 7, D-27/D-28) - the ONE close artifact.
 *
 * The client-side write that lands the invoice in the private `deal-artifacts`
 * bucket and records it as a `deal_artifact(category='invoice')`. Mirrors the
 * createThing discipline: browser client, getUser() guard, throw on error, and an
 * `as never` cast for the not-yet-typed `is_private` column.
 *
 * TWO steps:
 *   1. Storage: upload the file to `<deal_workspace_id>/<uuid>-<name>`. The bucket
 *      is PDF-only (D-28 / ASVS V5) and RLS-scoped by `can_access_workspace` on
 *      the first path segment, so only a deal-workspace member can write here.
 *   2. Row: insert the deal_artifact pointer. `uploaded_by_company_id` is the
 *      SESSION company - resolved from the authenticated user's own person row,
 *      NEVER a value passed in by the caller. The finalize gate later requires
 *      this to equal the SELLER company, so an honest uploader identity is
 *      load-bearing (ASVS V4).
 *
 * D-28 ONE-SHOT: the invoice is final. If an invoice artifact already exists for
 * this deal, the upload is rejected HERE (rather than in finalizeDeal) so the
 * seller gets the "already uploaded" rejection at the point of the second attempt;
 * a correction goes via the reopen ticket, not a re-upload.
 */
export async function uploadDealInvoice(args: {
  /** the deal_workspace_id - the storage folder AND the artifact's workspace. */
  workspaceId: string;
  /** the deal_card this invoice closes - the caller chains finalizeDeal with it. */
  dealCardId: string;
  file: File;
}): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("uploadDealInvoice: no authenticated user");

  // PDF-only, defence in depth (the bucket allowed_mime_types is the real guard).
  if (args.file.type && args.file.type !== "application/pdf") {
    throw new Error("uploadDealInvoice: the invoice must be a PDF.");
  }

  // SESSION company - the authenticated user's person row (RLS lets a user read
  // their OWN row), NEVER trusted from input. This is the uploader identity the
  // finalize gate checks against the seller company (ASVS V4).
  const { data: person, error: personErr } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (personErr) throw personErr;
  const companyId = person?.company_id ?? null;
  if (!companyId) throw new Error("uploadDealInvoice: no company in session");

  // D-28 ONE-SHOT: reject a second invoice for this deal (category='invoice', not
  // soft-deleted). RLS (dealart_all) scopes the read to workspace members.
  const { data: existing, error: existErr } = await supabase
    .from("deal_artifact")
    .select("id")
    .eq("deal_workspace_id", args.workspaceId)
    .eq("category", "invoice")
    .is("deleted_at", null)
    .limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) {
    throw new Error("An invoice has already been uploaded for this deal.");
  }

  // 1. STORAGE - namespaced by workspace so the bucket RLS (first path segment =
  // workspace id) scopes access. A uuid prefix avoids a name collision on re-use.
  const objectName = `${crypto.randomUUID()}-${args.file.name}`;
  const storagePath = `${args.workspaceId}/${objectName}`;
  const { error: upErr } = await supabase.storage
    .from("deal-artifacts")
    .upload(storagePath, args.file, { contentType: "application/pdf" });
  if (upErr) throw upErr;

  // 2. ROW - the deal_artifact pointer. is_private is not in the generated insert
  // type yet (getDealArtifacts reads it via a select cast), so the object is cast
  // `as never` (same discipline as createThing). The invoice is SHARED
  // (is_private=false) so the buyer sees Deal Executed + the document.
  const { error: rowErr } = await supabase.from("deal_artifact").insert({
    deal_workspace_id: args.workspaceId,
    uploaded_by_company_id: companyId,
    title: args.file.name,
    category: "invoice",
    storage_path: storagePath,
    original_filename: args.file.name,
    mime_type: "application/pdf",
    file_size_bytes: args.file.size,
    is_private: false,
    created_by: user.id,
  } as never);
  if (rowErr) throw rowErr;
}
