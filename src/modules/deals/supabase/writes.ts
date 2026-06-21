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
import type { StageCode, ThingStatus, ThingType, ThingView } from "../types";

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
 * Create a new Thing in a stage (3c, user-added). Defaults to a `task` (the
 * common case; the special `approval`/`document_upload` kinds are wired by 3d /
 * the upload task). The caller passes `sortOrder` (it knows the stage's current
 * count) so the new row lands at the end. RLS `thing_all` lets a member insert.
 * Returns the created row as a ThingView so the caller can append it in place.
 */
export async function createThing(args: {
  workspaceId: string;
  stageCode: StageCode;
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
  const { data, error } = await supabase
    .from("thing")
    .insert({
      deal_workspace_id: args.workspaceId,
      title: args.title.trim(),
      type,
      status: "open",
      stage_code: args.stageCode,
      sort_order: args.sortOrder,
      assignee_person_id: args.assigneePersonId ?? null,
      is_private: isPrivate,
      owner_company_id: args.ownerCompanyId ?? null,
      created_by: user.id,
    } as never)
    .select(
      "id, title, type, status, stage_code, sort_order, assignee_person_id, is_private, owner_company_id" as "id, title, type, status, stage_code, sort_order",
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
    stageCode: data.stage_code as StageCode,
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
 * private/shared choice. This write just persists the assignee + owner; the
 * own-side-vs-other-side decision (and any visibility flip) is the component's
 * job, applied via this write's `ownerCompanyId` and `setThingVisibility`.
 */
export async function assignThing(
  thingId: string,
  assigneePersonId: string | null,
  ownerCompanyId: string | null,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("assignThing: no authenticated user");

  const { error } = await supabase
    .from("thing")
    .update({
      assignee_person_id: assigneePersonId,
      owner_company_id: ownerCompanyId,
      updated_by: user.id,
    } as never)
    .eq("id", thingId);
  if (error) throw error;
}

/**
 * Mark a stage done (Phase 5, D-14) - a MANUAL user action, STORED, never
 * auto-flipped. Upserts one `deal_stage_completion` row per (workspace, stage),
 * stamping who marked it (T-05-05). A re-mark of the same stage updates the
 * existing row (the unique key), never inserts a second. SHARED - both sides see
 * the progress. The table is not in the generated types, so the table name +
 * row are cast (Muskan's documented pattern; no full regen this phase).
 */
export async function markStageDone(
  workspaceId: string,
  stageCode: StageCode,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("markStageDone: no authenticated user");

  const { error } = await supabase
    .from("deal_stage_completion" as never)
    .upsert(
      {
        deal_workspace_id: workspaceId,
        stage_code: stageCode,
        marked_done_by_person_id: user.id,
        marked_done_at: new Date().toISOString(),
      } as never,
      { onConflict: "deal_workspace_id,stage_code" } as never,
    );
  if (error) throw error;
}
